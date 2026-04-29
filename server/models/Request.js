import mongoose from 'mongoose';

const requestHistorySchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: ['NEW_REQUEST', 'UPDATE_REQUEST', 'CANCEL_REQUEST', 'RATE_REQUEST'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'completed', 'cancelled'],
      default: null,
    },
    changedBy: {
      type: String,
      enum: ['guest', 'staff', 'system'],
      default: 'system',
    },
    actorName: {
      type: String,
      default: null,
      trim: true,
    },
    note: {
      type: String,
      default: null,
      trim: true,
    },
    rating: {
      type: Number,
      default: null,
      min: 1,
      max: 5,
    },
    timestamp: {
      type: Date,
      default: () => new Date(),
    },
  },
  { _id: false }
);

const requestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    stayId: {
      type: String,
      default: null,
      index: true,
    },
    roomNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    guestName: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['services', 'room-service', 'problem', 'extra'],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'completed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    cancelledBy: {
      type: String,
      enum: ['guest', 'staff', null],
      default: null,
    },
    cancelledByName: {
      type: String,
      default: null,
      trim: true,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    rating: {
      type: Number,
      default: null,
      min: 1,
      max: 5,
    },
    ratedAt: {
      type: Date,
      default: null,
    },
    timestamp: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
    history: {
      type: [requestHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

requestSchema.index({ stayId: 1, timestamp: -1 });
requestSchema.index({ status: 1, timestamp: -1 });

const Request = mongoose.model('Request', requestSchema);

export { Request };
