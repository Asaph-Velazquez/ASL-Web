import express from 'express';
import { Stay } from '../models/index.js';
import { generateQRDataURL } from '../utils/qr.js';
import { buildStayToken, hasRoomConflict, processStayTransitions } from '../services/stayLifecycle.js';
import { verifyStaffToken } from '../middleware/auth.js';
import { validateBody, schemas } from '../middleware/security.js';
import { logOperationalError } from '../services/operationalLogs.js';

const router = express.Router();
router.use(verifyStaffToken);

function toDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeAdditionalGuests(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((guest) => (typeof guest === 'string' ? guest.trim() : ''))
    .filter(Boolean);
}

/**
 * POST /api/stays
 * Crea un nuevo documento Stay
 * Genera token JWT con datos de la estancia y lo guarda en Stay.qrToken
 */
router.post('/', validateBody(schemas.createStay), async (req, res) => {
  try {
    const { roomNumber, checkIn, checkOut, guestName, additionalGuests } = req.body;

    // Validar entrada
    if (!roomNumber || !checkIn || !checkOut) {
      return res.status(400).json({ 
        error: 'roomNumber, checkIn, and checkOut are required'
      });
    }

    // Validar fechas
    const checkInDate = toDate(checkIn);
    const checkOutDate = toDate(checkOut);
    
    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (checkOutDate <= checkInDate) {
      return res.status(400).json({ error: 'checkOut must be after checkIn' });
    }

    const hasConflict = await hasRoomConflict({
      roomNumber,
      checkIn: checkInDate,
      checkOut: checkOutDate,
    });

    if (hasConflict) {
      return res.status(409).json({
        error: 'There is a schedule conflict for that room',
      });
    }

    const now = new Date();
    const startsNow = checkInDate <= now && checkOutDate > now;

    // Crear documento de estancia o reservacion
    const stay = new Stay({
      roomNumber,
      guestName: typeof guestName === 'string' ? guestName.trim() || null : null,
      additionalGuests: normalizeAdditionalGuests(additionalGuests),
      checkIn: checkInDate,
      checkOut: checkOutDate,
      active: startsNow,
      status: startsNow ? 'active' : 'scheduled',
    });

    if (startsNow) {
      stay.qrToken = buildStayToken(stay);
    }

    await stay.save();

    return res.status(201).json({
      stayId: stay.stayId,
      qrToken: stay.qrToken,
      roomNumber: stay.roomNumber,
      guestName: stay.guestName,
      additionalGuests: stay.additionalGuests,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      active: stay.active,
      status: stay.status,
    });
  } catch (error) {
    console.error('Error creating stay:', error);
    logOperationalError('STAY_CREATE_FAILED', error, {
      roomNumber: req.body?.roomNumber,
      guestName: req.body?.guestName,
      actor: req.user?.username,
      actorRole: req.user?.role,
      source: 'api:stays',
    });
    return res.status(500).json({ error: 'Unable to create the reservation' });
  }
});

/**
 * GET /api/stays
 * Retorna todas las estancias para el listado del panel
 */
router.get('/', async (req, res) => {
  try {
    await processStayTransitions();
    const stays = await Stay.find().sort({ createdAt: -1 });
    return res.json(stays);
  } catch (error) {
    console.error('Error fetching stays:', error);
    logOperationalError('STAY_LIST_FAILED', error, {
      actor: req.user?.username,
      actorRole: req.user?.role,
      source: 'api:stays',
    });
    return res.status(500).json({ error: 'Unable to get reservations' });
  }
});

router.patch('/:stayId', validateBody(schemas.updateStay), async (req, res) => {
  try {
    const { stayId } = req.params;
    const { roomNumber, guestName, additionalGuests } = req.body;

    const stay = await Stay.findOne({ stayId });
    if (!stay) {
      return res.status(404).json({ error: 'Stay not found' });
    }

    const nextRoomNumber = typeof roomNumber === 'string' ? roomNumber.trim() : stay.roomNumber;
    const nextGuestName = typeof guestName === 'string' ? guestName.trim() || null : stay.guestName;
    const nextAdditionalGuests = additionalGuests !== undefined
      ? normalizeAdditionalGuests(additionalGuests)
      : stay.additionalGuests;

    if (nextRoomNumber !== stay.roomNumber) {
      const hasConflict = await hasRoomConflict({
        roomNumber: nextRoomNumber,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        excludeStayId: stay.stayId,
      });

      if (hasConflict) {
        return res.status(409).json({
          error: 'There is a schedule conflict for that room',
        });
      }
    }

    stay.roomNumber = nextRoomNumber;
    stay.guestName = nextGuestName;
    stay.additionalGuests = nextAdditionalGuests;

    if (stay.active && stay.status === 'active') {
      stay.qrToken = buildStayToken(stay);
    }

    await stay.save();

    return res.json({
      updated: true,
      stay,
    });
  } catch (error) {
    console.error('Error updating stay:', error);
    logOperationalError('STAY_UPDATE_FAILED', error, {
      stayId: req.params?.stayId,
      actor: req.user?.username,
      actorRole: req.user?.role,
      source: 'api:stays',
    });
    return res.status(500).json({ error: 'Unable to update the reservation' });
  }
});

/**
 * POST /api/stays/process-transitions
 * Ejecuta manualmente la rotacion de reservaciones a estancias activas
 */
router.post('/process-transitions', async (req, res) => {
  try {
    const result = await processStayTransitions();
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('Error processing transitions:', error);
    logOperationalError('STAY_PROCESS_TRANSITIONS_FAILED', error, {
      actor: req.user?.username,
      actorRole: req.user?.role,
      source: 'api:stays',
    });
    return res.status(500).json({ error: 'Unable to process reservation rotation' });
  }
});

/**
 * GET /api/stays/:stayId/qr
 * Genera una imagen QR que contiene el JWT de la estancia
 * Retorna data URL en base64 del QR en PNG
 */
router.get('/:stayId/qr', async (req, res) => {
  try {
    await processStayTransitions();
    const { stayId } = req.params;

    const stay = await Stay.findOne({ stayId });

    if (!stay) {
      return res.status(404).json({ error: 'Stay not found' });
    }

    if (!stay.active || stay.status !== 'active') {
      return res.status(409).json({ error: 'The reservation is not active yet, so a QR cannot be generated' });
    }

    if (!stay.qrToken) {
      stay.qrToken = buildStayToken(stay);
      await stay.save();
    }

    // Generar QR a partir del token JWT
    const qrDataURL = await generateQRDataURL(stay.qrToken);

    return res.json({ qrCode: qrDataURL, stayId });
  } catch (error) {
    console.error('Error generating QR code:', error);
    logOperationalError('STAY_QR_FAILED', error, {
      stayId: req.params?.stayId,
      actor: req.user?.username,
      actorRole: req.user?.role,
      source: 'api:stays',
    });
    return res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

/**
 * PATCH /api/stays/:stayId/end
 * Establece Stay.active = false
 */
router.patch('/:stayId/end', async (req, res) => {
  try {
    const { stayId } = req.params;

    const stay = await Stay.findOneAndUpdate(
      { stayId },
      { active: false, status: 'ended' },
      { new: true }
    );

    if (!stay) {
      return res.status(404).json({ error: 'Stay not found' });
    }

    return res.json({ ended: true, stay });
  } catch (error) {
    console.error('Error ending stay:', error);
    logOperationalError('STAY_END_FAILED', error, {
      stayId: req.params?.stayId,
      actor: req.user?.username,
      actorRole: req.user?.role,
      source: 'api:stays',
    });
    return res.status(500).json({ error: 'Failed to end stay' });
  }
});

/**
 * PATCH /api/stays/:stayId/extend
 * Extiende una reservacion si no existe conflicto con otras reservaciones
 */
router.patch('/:stayId/extend', validateBody(schemas.extendStay), async (req, res) => {
  try {
    const { stayId } = req.params;
    const { newCheckOut } = req.body;

    const stay = await Stay.findOne({ stayId });
    if (!stay) {
      return res.status(404).json({ error: 'Stay not found' });
    }

    if (stay.status === 'ended' || stay.status === 'cancelled') {
      return res.status(400).json({ error: 'Ended or cancelled stays cannot be extended' });
    }

    const newCheckOutDate = toDate(newCheckOut);
    if (!newCheckOutDate) {
      return res.status(400).json({ error: 'Invalid date format for the new check-out' });
    }

    if (newCheckOutDate <= stay.checkOut) {
      return res.status(400).json({ error: 'The new check-out must be after the current check-out' });
    }

    const hasConflict = await hasRoomConflict({
      roomNumber: stay.roomNumber,
      checkIn: stay.checkIn,
      checkOut: newCheckOutDate,
      excludeStayId: stay.stayId,
    });

    if (hasConflict) {
      return res.status(409).json({
        error: 'Cannot extend: another reservation conflicts on the calendar',
      });
    }

    stay.checkOut = newCheckOutDate;
    if (stay.active && stay.status === 'active') {
      stay.qrToken = buildStayToken(stay);
    }
    await stay.save();

    return res.json({
      extended: true,
      stay,
      qrRegenerated: stay.active && stay.status === 'active',
    });
  } catch (error) {
    console.error('Error extending stay:', error);
    logOperationalError('STAY_EXTEND_FAILED', error, {
      stayId: req.params?.stayId,
      actor: req.user?.username,
      actorRole: req.user?.role,
      source: 'api:stays',
    });
    return res.status(500).json({ error: 'Unable to extend the reservation' });
  }
});

/**
 * PATCH /api/stays/:stayId/cancel
 * Cancela una reservacion o estancia sin eliminar historial
 */
router.patch('/:stayId/cancel', async (req, res) => {
  try {
    const { stayId } = req.params;

    const stay = await Stay.findOne({ stayId });
    if (!stay) {
      return res.status(404).json({ error: 'Stay not found' });
    }

    if (stay.status === 'ended') {
      return res.status(400).json({ error: 'Ended stays cannot be cancelled' });
    }

    if (stay.status === 'cancelled') {
      return res.status(400).json({ error: 'The reservation was already cancelled' });
    }

    stay.active = false;
    stay.status = 'cancelled';
    await stay.save();

    const transitions = await processStayTransitions();

    return res.json({
      cancelled: true,
      stay,
      transitions,
    });
  } catch (error) {
    console.error('Error cancelling stay:', error);
    logOperationalError('STAY_CANCEL_FAILED', error, {
      stayId: req.params?.stayId,
      actor: req.user?.username,
      actorRole: req.user?.role,
      source: 'api:stays',
    });
    return res.status(500).json({ error: 'Unable to cancel the reservation' });
  }
});

/**
 * DELETE /api/stays/:stayId
 * Elimina el documento de estancia
 */
router.delete('/:stayId', async (req, res) => {
  try {
    const { stayId } = req.params;

    const stay = await Stay.findOneAndDelete({ stayId });

    if (!stay) {
      return res.status(404).json({ error: 'Stay not found' });
    }

    return res.json({ deleted: true, stayId });
  } catch (error) {
    console.error('Error deleting stay:', error);
    logOperationalError('STAY_DELETE_FAILED', error, {
      stayId: req.params?.stayId,
      actor: req.user?.username,
      actorRole: req.user?.role,
      source: 'api:stays',
    });
    return res.status(500).json({ error: 'Failed to delete stay' });
  }
});

export default router;
