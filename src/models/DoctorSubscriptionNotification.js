import mongoose from 'mongoose';

const doctorSubscriptionNotificationSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true
    },
    eventType: {
      type: String,
      enum: [
        'plan_bought',
        'plan_renewed',
        'plan_updated',
        'plan_cancelled',
        'plan_expired'
      ],
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
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

doctorSubscriptionNotificationSchema.index({ doctorId: 1, createdAt: -1 });

export const DoctorSubscriptionNotification = mongoose.model(
  'DoctorSubscriptionNotification',
  doctorSubscriptionNotificationSchema
);
