import mongoose from 'mongoose';

const consentSchema = new mongoose.Schema({
  installationId: { type: String, required: true },
  policyVersion: { type: String, required: true },
  privacyAccepted: { type: Boolean, required: true },
  cameraAccepted: { type: Boolean, required: true },
  cameraPermission: { type: String, enum: ['requested', 'granted', 'denied'], required: true },
  acceptedAt: { type: Date, required: true },
  permissionUpdatedAt: { type: Date, required: true },
}, { versionKey: false });
consentSchema.index({ installationId: 1, policyVersion: 1 }, { unique: true });

export const Consent = mongoose.model('Consent', consentSchema);
