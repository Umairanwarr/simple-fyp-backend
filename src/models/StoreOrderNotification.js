import mongoose from 'mongoose';

const storeOrderNotificationSchema = new mongoose.Schema(
  {
    // For store-side notifications (new order received)
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicalStore',
      default: null,
      index: true
    },
    // For patient-side notifications (order accepted / declined)
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      default: null,
      index: true
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StoreOrder',
      required: true
    },
    eventType: {
      type: String,
      enum: ['order_placed', 'order_accepted', 'order_declined'],
      required: true,
      index: true
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

storeOrderNotificationSchema.index({ storeId: 1, createdAt: -1 });
storeOrderNotificationSchema.index({ patientId: 1, createdAt: -1 });

export const StoreOrderNotification = mongoose.model(
  'StoreOrderNotification',
  storeOrderNotificationSchema
);
