import mongoose from 'mongoose';

const clinicServiceSchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true
    },
    serviceType: {
      type: String,
      enum: ['lab', 'facility'],
      required: true,
      trim: true,
      lowercase: true
    },
    isActive: {
      type: Boolean,
      default: true
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
          default: 'offline'
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

clinicServiceSchema.index({ clinicId: 1, serviceType: 1, createdAt: -1 });

export const ClinicService = mongoose.model('ClinicService', clinicServiceSchema);
