import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

const staySchema = new mongoose.Schema({
  stayId: {
    type: String,
    unique: true,
    required: true,
    default: () => randomUUID()
  },
  roomNumber: {
    type: String,
    required: true
  },
  guestName: {
    type: String,
    default: null
  },
  checkIn: {
    type: Date,
    required: true
  },
  checkOut: {
    type: Date,
    required: true
  },
  qrToken: {
    type: String,
    unique: true
  },
  active: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: () => new Date()
  }
});

const Stay = mongoose.model('Stay', staySchema);

export { Stay };
