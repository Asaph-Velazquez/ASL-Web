import express from 'express';
import mongoose from 'mongoose';
import { timingSafeEqual } from 'node:crypto';
import { StaffUser } from '../models/StaffUser.js';

const router = express.Router();

export function requireCallInternalToken(req, res, next) {
  const expected = Buffer.from(process.env.CALL_INTERNAL_TOKEN || '');
  const actual = Buffer.from(req.get('x-internal-token') || '');
  if (!expected.length || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return res.status(401).json({ code: 'INVALID_INTERNAL_TOKEN', error: 'Invalid internal token' });
  }
  next();
}

const identity = user => ({ userId: String(user._id), username: user.username,
  fullName: user.fullName || user.username, role: user.role });

router.post('/authenticate', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string'
      || !username.trim() || username.length > 50 || password.length > 100 || password.trim().length < 6) {
    return res.status(400).json({ error: 'Invalid login fields' });
  }
  try {
    const user = await StaffUser.findOne({ username: username.trim() }).maxTimeMS(4000);
    if (!user || !await user.comparePassword(password.trim()) || user.role !== 'interpreter') {
      return res.status(401).json({ error: 'Invalid credentials or interpreter access not granted' });
    }
    return res.json({ interpreter: identity(user) });
  } catch {
    return res.status(503).json({ error: 'Hotel authentication unavailable' });
  }
});

router.post('/validate', async (req, res) => {
  if (typeof req.body?.userId !== 'string' || !mongoose.isObjectIdOrHexString(req.body.userId)) {
    return res.status(401).json({ error: 'Interpreter access revoked' });
  }
  try {
    const user = await StaffUser.findById(req.body.userId).select('-password').maxTimeMS(4000);
    if (!user || user.role !== 'interpreter') return res.status(401).json({ error: 'Interpreter access revoked' });
    return res.json({ interpreter: identity(user) });
  } catch {
    return res.status(503).json({ error: 'Hotel authentication unavailable' });
  }
});

export default router;
