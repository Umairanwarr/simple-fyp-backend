import mongoose from 'mongoose';

const bugReportSchema = new mongoose.Schema(
  {
    reporterRole: {
      type: String,
      enum: ['patient', 'doctor', 'clinic', 'medical-store'],
      required: true,
      index: true
    },
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true
    },
    reporterName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    reporterEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
      maxlength: 180
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000
    },
    status: {
      type: String,
      enum: ['open', 'resolved'],
      default: 'open',
      index: true
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    }
  },
  {
    timestamps: true
  }
);

export const BugReport = mongoose.model('BugReport', bugReportSchema);
