import mongoose from 'mongoose';

const doctorMediaSchema = new mongoose.Schema(
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
    mediaType: {
      type: String,
      enum: ['image', 'video'],
      required: true,
      index: true
    },
    asset: {
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
        default: ''
      },
      bytes: {
        type: Number,
        default: null
      }
    },
    moderationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true
    },
    moderationNote: {
      type: String,
      default: '',
      maxlength: 500
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
    deletedAt: {
      type: Date,
      default: null,
      index: true
    },
    deletedByDoctor: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

doctorMediaSchema.index({ doctorId: 1, deletedAt: 1, createdAt: -1 });
doctorMediaSchema.index({ moderationStatus: 1, deletedAt: 1, createdAt: -1 });

export const DoctorMedia = mongoose.model('DoctorMedia', doctorMediaSchema);
