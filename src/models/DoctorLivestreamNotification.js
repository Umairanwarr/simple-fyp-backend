import mongoose from 'mongoose';

const doctorLivestreamNotificationSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true
    },
    streamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LiveStream',
      required: true
    },
    streamTitle: {
      type: String,
      required: true
    },
    eventType: {
      type: String,
      enum: ['terminated_by_admin'],
      default: 'terminated_by_admin',
      required: true
    },
    reason: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false
  }
);

doctorLivestreamNotificationSchema.index({ doctorId: 1, createdAt: -1 });

export const DoctorLivestreamNotification = mongoose.model(
  'DoctorLivestreamNotification',
  doctorLivestreamNotificationSchema
);
