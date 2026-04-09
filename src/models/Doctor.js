import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

const doctorSchema = new mongoose.Schema(
  {
    fullName: {
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
    specialization: {
      type: String,
      required: true,
      trim: true
    },
    licenseNumber: {
      type: String,
      required: true,
      trim: true
    },
    experience: {
      type: Number,
      required: true,
      min: 0
    },
    address: {
      type: String,
      required: true,
      trim: true
    },
    bio: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1200
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
      default: 'doctor'
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
    profileCtr: {
      type: Number,
      default: 0,
      min: 0
    },
    reviews: [
      {
        appointmentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Appointment',
          default: null
        },
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
    notificationsSeenAt: {
      type: Date,
      default: null
    },
    availabilitySlots: [
      {
        date: {
          type: String,
          required: true,
          trim: true
        },
        fromTime: {
          type: String,
          required: true,
          trim: true
        },
        toTime: {
          type: String,
          required: true,
          trim: true
        },
        consultationMode: {
          type: String,
          enum: ['online', 'offline'],
          default: 'online'
        },
        priceInRupees: {
          type: Number,
          min: 0,
          default: 0
        }
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

doctorSchema.pre('save', async function preSave(next) {
  if (!this.isModified('password')) {
    return next();
  }

  this.password = await bcrypt.hash(this.password, 10);
  next();
});

doctorSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export const Doctor = mongoose.model('Doctor', doctorSchema);
