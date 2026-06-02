import mongoose from 'mongoose';

const campaignPromotionSchema = new mongoose.Schema(
  {
    accountRole: {
      type: String,
      enum: ['doctor', 'medical-store', 'clinic'],
      required: true,
      index: true
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
      index: true
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicalStore',
      default: null,
      index: true
    },
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      default: null,
      index: true
    },
    accountName: {
      type: String,
      required: true,
      trim: true
    },
    accountEmail: {
      type: String,
      default: '',
      lowercase: true,
      trim: true
    },
    accountPhone: {
      type: String,
      default: '',
      trim: true
    },
    planId: {
      type: String,
      required: true,
      trim: true
    },
    planName: {
      type: String,
      required: true,
      trim: true
    },
    amountInRupees: {
      type: Number,
      required: true,
      min: 0
    },
    durationDays: {
      type: Number,
      required: true,
      min: 1
    },
    status: {
      type: String,
      enum: ['active', 'expired'],
      default: 'active',
      index: true
    },
    activatedAt: {
      type: Date,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    stripeCheckoutSessionId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    stripePaymentIntentId: {
      type: String,
      default: '',
      trim: true
    },
    stripeCustomerId: {
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: true
  }
);

campaignPromotionSchema.index({ accountRole: 1, status: 1, expiresAt: 1 });
campaignPromotionSchema.index({ doctorId: 1, status: 1 });
campaignPromotionSchema.index({ storeId: 1, status: 1 });
campaignPromotionSchema.index({ clinicId: 1, status: 1 });

export const CampaignPromotion = mongoose.model('CampaignPromotion', campaignPromotionSchema);
