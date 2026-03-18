import express from 'express';
import { Stay } from '../models/index.js';
import { generateQRDataURL } from '../utils/qr.js';
import { buildStayToken, hasRoomConflict, processStayTransitions } from '../services/stayLifecycle.js';

const router = express.Router();

function toDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * POST /api/stays
 * Crea un nuevo documento Stay
 * Genera token JWT con datos de la estancia y lo guarda en Stay.qrToken
 */
router.post('/', async (req, res) => {
  try {
    const { roomNumber, checkIn, checkOut, guestName } = req.body;

    // Validar entrada
    if (!roomNumber || !checkIn || !checkOut) {
      return res.status(400).json({ 
        error: 'roomNumber, checkIn y checkOut son requeridos'
      });
    }

    // Validar fechas
    const checkInDate = toDate(checkIn);
    const checkOutDate = toDate(checkOut);
    
    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({ error: 'Formato de fecha invalido' });
    }

    if (checkOutDate <= checkInDate) {
      return res.status(400).json({ error: 'checkOut debe ser mayor que checkIn' });
    }

    const hasConflict = await hasRoomConflict({
      roomNumber,
      checkIn: checkInDate,
      checkOut: checkOutDate,
    });

    if (hasConflict) {
      return res.status(409).json({
        error: 'Existe un conflicto de horario para esa habitacion',
      });
    }

    const now = new Date();
    const startsNow = checkInDate <= now && checkOutDate > now;

    // Crear documento de estancia o reservacion
    const stay = new Stay({
      roomNumber,
      guestName: typeof guestName === 'string' ? guestName.trim() || null : null,
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
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      active: stay.active,
      status: stay.status,
    });
  } catch (error) {
    console.error('Error creating stay:', error);
    return res.status(500).json({ error: 'No se pudo crear la reservacion' });
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
    return res.status(500).json({ error: 'No se pudieron obtener las reservaciones' });
  }
});

/**
 * POST /api/stays/process-transitions
 * Ejecuta manualmente la rotacion de reservaciones a estancias activas
 */
router.post('/process-transitions', async (_req, res) => {
  try {
    const result = await processStayTransitions();
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('Error processing transitions:', error);
    return res.status(500).json({ error: 'No se pudo procesar la rotacion de reservaciones' });
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
      return res.status(409).json({ error: 'La reservacion aun no esta activa para generar QR' });
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
    return res.status(500).json({ error: 'Failed to end stay' });
  }
});

/**
 * PATCH /api/stays/:stayId/extend
 * Extiende una reservacion si no existe conflicto con otras reservaciones
 */
router.patch('/:stayId/extend', async (req, res) => {
  try {
    const { stayId } = req.params;
    const { newCheckOut } = req.body;

    const stay = await Stay.findOne({ stayId });
    if (!stay) {
      return res.status(404).json({ error: 'Stay not found' });
    }

    if (stay.status === 'ended') {
      return res.status(400).json({ error: 'No se puede extender una estancia finalizada' });
    }

    const newCheckOutDate = toDate(newCheckOut);
    if (!newCheckOutDate) {
      return res.status(400).json({ error: 'Formato de fecha invalido para nueva salida' });
    }

    if (newCheckOutDate <= stay.checkOut) {
      return res.status(400).json({ error: 'La nueva salida debe ser posterior a la salida actual' });
    }

    const hasConflict = await hasRoomConflict({
      roomNumber: stay.roomNumber,
      checkIn: stay.checkIn,
      checkOut: newCheckOutDate,
      excludeStayId: stay.stayId,
    });

    if (hasConflict) {
      return res.status(409).json({
        error: 'No se puede extender: existe conflicto con otra reservacion en el calendario',
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
    return res.status(500).json({ error: 'No se pudo extender la reservacion' });
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
      return res.status(400).json({ error: 'No se puede cancelar una estancia finalizada' });
    }

    if (stay.status === 'cancelled') {
      return res.status(400).json({ error: 'La reservacion ya estaba cancelada' });
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
    return res.status(500).json({ error: 'No se pudo cancelar la reservacion' });
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
    return res.status(500).json({ error: 'Failed to delete stay' });
  }
});

export default router;
