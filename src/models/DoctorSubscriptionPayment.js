import mongoose from 'mongoose';

const doctorSubscriptionPaymentSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true
    },
    doctorName: {
      type: String,
      required: true,
      trim: true
    },
    doctorEmail: {
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

doctorSubscriptionPaymentSchema.index({ stripeCheckoutSessionId: 1 }, { unique: true, sparse: true });
doctorSubscriptionPaymentSchema.index({ purchasedAt: -1 });

export const DoctorSubscriptionPayment = mongoose.model(
  'DoctorSubscriptionPayment',
  doctorSubscriptionPaymentSchema
);
