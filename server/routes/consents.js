import express from 'express';
import { z } from 'zod';
import { Consent } from '../models/Consent.js';

const payloadSchema = z.object({
  installationId: z.string().regex(/^[a-f0-9]{32}$/),
  policyVersion: z.literal('2026-10-26'),
  privacyAccepted: z.literal(true),
  cameraAccepted: z.literal(true),
  cameraPermission: z.enum(['requested', 'granted', 'denied']),
}).strict();

export function createConsentRouter(Model = Consent) {
  const router = express.Router();
  router.post('/', async (req, res) => {
    const parsed = payloadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid consent' });
    const { installationId, policyVersion, cameraPermission } = parsed.data;
    const filter = { installationId, policyVersion };
    const now = new Date();
    try {
      const update = { $set: { cameraPermission, permissionUpdatedAt: now },
        $setOnInsert: { ...filter, privacyAccepted: true, cameraAccepted: true, acceptedAt: now } };
      try {
        await Model.updateOne(filter, update, { upsert: true, runValidators: true });
      } catch (error) {
        // Dos reintentos simultáneos comparten una sola aceptación y su fecha original.
        if (error.code !== 11000) throw error;
        await Model.updateOne(filter, { $set: update.$set }, { runValidators: true });
      }
      return res.json({ accepted: true, policyVersion });
    } catch {
      return res.status(503).json({ error: 'Consent could not be saved' });
    }
  });
  return router;
}

export default createConsentRouter();
