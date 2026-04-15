import mongoose from 'mongoose';

const subscriptionPricingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    platinumPriceInRupees: {
      type: Number,
      default: 0,
      min: 0
    },
    goldPriceInRupees: {
      type: Number,
      default: 999,
      min: 0
    },
    diamondPriceInRupees: {
      type: Number,
      default: 2999,
      min: 0
    },
    updatedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    }
  },
  {
    timestamps: true
  }
);

export const SubscriptionPricing = mongoose.model('SubscriptionPricing', subscriptionPricingSchema);
