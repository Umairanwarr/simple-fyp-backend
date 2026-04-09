import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    },
    dob: {
      type: Date,
      required: true
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      default: 'male'
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      default: 'patient'
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    verificationOtpHash: {
      type: String,
      default: null
    },
    verificationOtpExpiresAt: {
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
    notificationsSeenAt: {
      type: Date,
      default: null
    },
    favoriteDoctorIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor'
      }
    ],
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
    }
  },
  {
    timestamps: true
  }
);

patientSchema.pre('save', async function preSave(next) {
  if (!this.isModified('password')) {
    return next();
  }

  this.password = await bcrypt.hash(this.password, 10);
  next();
});

patientSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export const Patient = mongoose.model('Patient', patientSchema);
