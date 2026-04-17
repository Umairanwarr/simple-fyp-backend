import mongoose from 'mongoose';

const medicalStoreSubscriptionNotificationSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicalStore',
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

medicalStoreSubscriptionNotificationSchema.index({ storeId: 1, createdAt: -1 });

export const MedicalStoreSubscriptionNotification = mongoose.model(
  'MedicalStoreSubscriptionNotification',
  medicalStoreSubscriptionNotificationSchema
);
