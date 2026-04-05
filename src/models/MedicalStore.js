import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

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
    }
  },
  {
    timestamps: true
  }
);

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
