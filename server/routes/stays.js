import express from 'express';
import jwt from 'jsonwebtoken';
import { Stay } from '../models/index.js';
import { generateQRDataURL } from '../utils/qr.js';

const router = express.Router();

/**
 * POST /api/stays
 * Crea un nuevo documento Stay
 * Genera token JWT con datos de la estancia y lo guarda en Stay.qrToken
 */
router.post('/', async (req, res) => {
  try {
    const { roomNumber, checkIn, checkOut } = req.body;

    // Validar entrada
    if (!roomNumber || !checkIn || !checkOut) {
      return res.status(400).json({ 
        error: 'roomNumber, checkIn, and checkOut are required' 
      });
    }

    // Validar fechas
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    
    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (checkOutDate <= checkInDate) {
      return res.status(400).json({ error: 'checkOut must be after checkIn' });
    }

    // Crear documento de estancia (stayId se genera automaticamente)
    const stay = new Stay({
      roomNumber,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      active: true
    });

    // Generar token JWT con los datos de la estancia
    const token = jwt.sign(
      {
        stayId: stay.stayId,
        roomNumber: stay.roomNumber,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' } // Token valido para la duracion maxima de la estancia
    );

    // Guardar token en la estancia
    stay.qrToken = token;
    await stay.save();

    return res.status(201).json({
      stayId: stay.stayId,
      qrToken: stay.qrToken,
      roomNumber: stay.roomNumber,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut
    });
  } catch (error) {
    console.error('Error creating stay:', error);
    return res.status(500).json({ error: 'Failed to create stay' });
  }
});

/**
 * GET /api/stays
 * Retorna todas las estancias para el listado del panel
 */
router.get('/', async (req, res) => {
  try {
    const stays = await Stay.find().sort({ createdAt: -1 });
    return res.json(stays);
  } catch (error) {
    console.error('Error fetching stays:', error);
    return res.status(500).json({ error: 'Failed to fetch stays' });
  }
});

/**
 * GET /api/stays/:stayId/qr
 * Genera una imagen QR que contiene el JWT de la estancia
 * Retorna data URL en base64 del QR en PNG
 */
router.get('/:stayId/qr', async (req, res) => {
  try {
    const { stayId } = req.params;

    const stay = await Stay.findOne({ stayId });

    if (!stay) {
      return res.status(404).json({ error: 'Stay not found' });
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
      { active: false },
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
