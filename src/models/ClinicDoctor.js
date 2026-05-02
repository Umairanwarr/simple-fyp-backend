import mongoose from 'mongoose';

const clinicDoctorSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true
    },
    clinicName: {
      type: String,
      default: '',
      trim: true
    },
    clinicEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    specialization: {
      type: String,
      required: true,
      trim: true
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
          enum: ['online', 'offline', 'video'],
          default: 'online'
        },
        offlineAddress: {
          type: String,
          default: '',
          trim: true,
          maxlength: 240
        },
        priceInRupees: {
          type: Number,
          min: 0,
          default: 0
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

clinicDoctorSchema.index({ clinicId: 1, createdAt: -1 });

export const ClinicDoctor = mongoose.model('ClinicDoctor', clinicDoctorSchema);
