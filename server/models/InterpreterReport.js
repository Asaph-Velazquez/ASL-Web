import mongoose from 'mongoose';

const interpreterReportSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    callId: {
      type: String,
      required: true,
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
    interpreterId: {
      type: String,
      required: true,
      trim: true,
    },
    interpreterName: {
      type: String,
      required: true,
      trim: true,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    followUpRequired: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    requestId: {
      type: String,
      default: null,
      index: true,
    },
    submittedAt: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

interpreterReportSchema.index({ roomNumber: 1, submittedAt: -1 });
interpreterReportSchema.index({ followUpRequired: 1, submittedAt: -1 });

const InterpreterReport = mongoose.model('InterpreterReport', interpreterReportSchema);

export { InterpreterReport };
