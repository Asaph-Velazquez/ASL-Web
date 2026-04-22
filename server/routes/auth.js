import express from 'express';
import jwt from 'jsonwebtoken';
import { Stay } from '../models/index.js';
import { verifyToken } from '../middleware/auth.js';
import { processStayTransitions } from '../services/stayLifecycle.js';
import { registerLimiter, validateBody, schemas } from '../middleware/security.js';

const router = express.Router();

/**
 * POST /api/auth/validate
 * Valida el token JWT contra la base de datos
 * Verifica: JWT valido, Stay.active === true, Stay.checkOut > now
 */
router.post('/validate', verifyToken, async (req, res) => {
  try {
    await processStayTransitions();
    const { stayId } = req.user;

    // Buscar estancia en la base de datos
    const stay = await Stay.findOne({ stayId });

    if (!stay) {
      return res.status(401).json({ valid: false, reason: 'stay_not_found' });
    }

    // Verificar si la estancia esta activa
    if (!stay.active) {
      return res.status(401).json({ valid: false, reason: 'stay_ended' });
    }

    // Verificar si la fecha de salida ya paso
    const now = new Date();
    if (stay.checkOut <= now) {
      return res.status(401).json({ valid: false, reason: 'stay_expired' });
    }

    // El token es valido
    return res.json({
      valid: true,
      roomNumber: stay.roomNumber,
      stayId: stay.stayId,
      expiresAt: stay.checkOut
    });
  } catch (error) {
    console.error('Error validating token:', error);
    return res.status(500).json({ error: 'Token validation failed' });
  }
});

/**
 * POST /api/auth/register
 * Recibe token JWT + { guestName }
 * Actualiza Stay con guestName
 * Retorna un nuevo JWT con guestName incluido
 */
router.post('/register', registerLimiter, verifyToken, validateBody(schemas.guestRegister), async (req, res) => {
  try {
    await processStayTransitions();
    const { stayId } = req.user;
    const { guestName } = req.body;

    // Validar entrada
    if (!guestName || typeof guestName !== 'string') {
      return res.status(400).json({ error: 'guestName is required and must be a string' });
    }

    // Buscar y actualizar estancia
    const stay = await Stay.findOneAndUpdate(
      { stayId },
      { guestName },
      { new: true }
    );

    if (!stay) {
      return res.status(404).json({ error: 'Stay not found' });
    }

    // Generar nuevo token de sesion con guestName
    const sessionToken = jwt.sign(
      {
        stayId: stay.stayId,
        roomNumber: stay.roomNumber,
        guestName: stay.guestName,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      sessionToken,
      guestName: stay.guestName,
      roomNumber: stay.roomNumber
    });
  } catch (error) {
    console.error('Error registering guest:', error);
    return res.status(500).json({ error: 'Guest registration failed' });
  }
});

export default router;
