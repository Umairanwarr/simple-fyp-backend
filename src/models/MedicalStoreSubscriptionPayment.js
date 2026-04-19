import mongoose from 'mongoose';

const medicalStoreSubscriptionPaymentSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicalStore',
      required: true,
      index: true
    },
    storeName: {
      type: String,
      required: true,
      trim: true
    },
    storeEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    plan: {
      type: String,
      enum: ['gold', 'diamond'],
      required: true
    },
    action: {
      type: String,
      enum: ['buy', 'renew', 'update'],
      required: true
    },
    amountInRupees: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'pkr',
      lowercase: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['succeeded', 'refunded', 'failed'],
      default: 'succeeded'
    },
    purchasedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      default: null
    },
    stripeCheckoutSessionId: {
      type: String,
      default: ''
    },
    stripePaymentIntentId: {
      type: String,
      default: ''
    },
    stripeCustomerId: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

medicalStoreSubscriptionPaymentSchema.index({ stripeCheckoutSessionId: 1 }, { unique: true, sparse: true });
medicalStoreSubscriptionPaymentSchema.index({ purchasedAt: -1 });

export const MedicalStoreSubscriptionPayment = mongoose.model(
  'MedicalStoreSubscriptionPayment',
  medicalStoreSubscriptionPaymentSchema
);
