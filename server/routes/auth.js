import express from 'express';
import jwt from 'jsonwebtoken';
import { Stay } from '../models/index.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/auth/validate
 * Validates JWT token against database
 * Checks: JWT validity, Stay.active === true, Stay.checkOut > now
 */
router.post('/validate', verifyToken, async (req, res) => {
  try {
    const { stayId } = req.user;

    // Find stay in database
    const stay = await Stay.findOne({ stayId });

    if (!stay) {
      return res.status(401).json({ valid: false, reason: 'stay_not_found' });
    }

    // Check if stay is active
    if (!stay.active) {
      return res.status(401).json({ valid: false, reason: 'stay_ended' });
    }

    // Check if checkout date has passed
    const now = new Date();
    if (stay.checkOut <= now) {
      return res.status(401).json({ valid: false, reason: 'stay_expired' });
    }

    // Token is valid
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
 * Receives JWT token + { guestName }
 * Updates Stay with guestName
 * Returns new JWT with guestName included
 */
router.post('/register', verifyToken, async (req, res) => {
  try {
    const { stayId } = req.user;
    const { guestName } = req.body;

    // Validate input
    if (!guestName || typeof guestName !== 'string') {
      return res.status(400).json({ error: 'guestName is required and must be a string' });
    }

    // Find and update stay
    const stay = await Stay.findOneAndUpdate(
      { stayId },
      { guestName },
      { new: true }
    );

    if (!stay) {
      return res.status(404).json({ error: 'Stay not found' });
    }

    // Generate new session token with guestName
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
