import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

const hasValidGeoLocation = (location) => {
  return location
    && location.type === 'Point'
    && Array.isArray(location.coordinates)
    && location.coordinates.length === 2
    && location.coordinates.every((coordinate) => Number.isFinite(coordinate));
};

const clearInvalidGeoLocation = function clearInvalidGeoLocation(next) {
  if (this.location && !hasValidGeoLocation(this.location)) {
    this.location = undefined;
    this.markModified('location');
  }

  next();
};

const geoLocationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point']
    },
    coordinates: {
      type: [Number],
      default: undefined,
      validate: {
        validator: (coordinates) => Array.isArray(coordinates)
          && coordinates.length === 2
          && coordinates.every((coordinate) => Number.isFinite(coordinate)),
        message: 'Location coordinates must include longitude and latitude'
      }
    },
    placeId: {
      type: String,
      default: '',
      trim: true
    },
    formattedAddress: {
      type: String,
      default: '',
      trim: true
    }
  },
  { _id: false }
);

const medicalStoreSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    licenseNumber: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      type: String,
      required: true,
      trim: true
    },
    location: {
      type: geoLocationSchema,
      default: undefined
    },
    operatingHours: {
      type: String,
      required: true,
      trim: true
    },
    licenseDocument: {
      url: {
        type: String,
        required: true
      },
      publicId: {
        type: String,
        required: true
      },
      resourceType: {
        type: String,
        required: true
      },
      format: {
        type: String,
        default: null
      },
      originalName: {
        type: String,
        default: null
      },
      bytes: {
        type: Number,
        default: null
      }
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      default: 'medical-store'
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    applicationStatus: {
      type: String,
      enum: ['pending', 'approved', 'declined'],
      default: 'pending'
    },
    adminReviewNote: {
      type: String,
      default: ''
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    },
    verificationOtpHash: {
      type: String,
      default: null
    },
    verificationOtpExpiresAt: {
      type: Date,
      default: null
    },
    loginOtpHash: {
      type: String,
      default: null
    },
    loginOtpExpiresAt: {
      type: Date,
      default: null
    },
    resetPasswordTokenHash: {
      type: String,
      default: null
    },
    resetPasswordTokenExpiresAt: {
      type: Date,
      default: null
    },
    avatarDocument: {
      url: {
        type: String,
        default: ''
      },
      publicId: {
        type: String,
        default: null
      },
      resourceType: {
        type: String,
        default: null
      },
      format: {
        type: String,
        default: null
      },
      originalName: {
        type: String,
        default: null
      },
      bytes: {
        type: Number,
        default: null
      }
    },
    currentPlan: {
      type: String,
      enum: ['platinum', 'gold', 'diamond'],
      default: 'platinum'
    },
    subscriptionStatus: {
      type: String,
      enum: ['active', 'cancelled', 'expired'],
      default: 'active'
    },
    planActivatedAt: {
      type: Date,
      default: Date.now
    },
    planExpiresAt: {
      type: Date,
      default: null
    },
    planCancelledAt: {
      type: Date,
      default: null
    },
    lastPlanPaymentAt: {
      type: Date,
      default: null
    },
    lastPlanCheckoutSessionId: {
      type: String,
      default: ''
    },
    lastPlanPaymentIntentId: {
      type: String,
      default: ''
    },
    stripeCustomerId: {
      type: String,
      default: ''
    },
    notificationsSeenAt: {
      type: Date,
      default: Date.now
    },
    bio: {
      type: String,
      default: '',
      trim: true
    },
    reviews: [
      {
        patientId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Patient',
          required: true
        },
        patientName: {
          type: String,
          required: true
        },
        rating: {
          type: Number,
          required: true,
          min: 1,
          max: 5
        },
        comment: {
          type: String,
          default: '',
          maxlength: 1000
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    averageRating: {
      type: Number,
      default: 0
    },
    totalReviews: {
      type: Number,
      default: 0
    },
    bankAccount: {
      accountTitle: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      bankName: { type: String, default: '' }
    },
    totalEarningsInRupees: {
      type: Number,
      default: 0,
      min: 0
    },
    withdrawnAmountInRupees: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

medicalStoreSchema.index(
  { location: '2dsphere' },
  {
    partialFilterExpression: {
      'location.type': 'Point',
      'location.coordinates.0': { $exists: true },
      'location.coordinates.1': { $exists: true }
    }
  }
);

medicalStoreSchema.pre('validate', clearInvalidGeoLocation);

medicalStoreSchema.pre('save', async function preSave(next) {
  if (!this.isModified('password')) {
    return next();
  }

  this.password = await bcrypt.hash(this.password, 10);
  next();
});

medicalStoreSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export const MedicalStore = mongoose.model('MedicalStore', medicalStoreSchema);
