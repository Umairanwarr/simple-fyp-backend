import mongoose from 'mongoose';

export const buildPrescriptionSerialNumber = (id) => {
  const suffix = String(id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
  return `#SIMPLE-${suffix || '000000'}`;
};

const prescriptionSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true
    },
    notes: {
      type: String,
      default: ''
    },
    serialNumber: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
      default: function defaultSerialNumber() {
        return buildPrescriptionSerialNumber(this._id);
      }
    },
    // Only set when an image/PDF is uploaded; null otherwise
    attachmentUrl: {
      type: String,
      default: null
    },
    attachmentPublicId: {
      type: String,
      default: null
    },
    attachmentFileType: {
      type: String, // 'image' | 'raw' (PDF)
      default: null
    }
  },
  {
    timestamps: true
  }
);

prescriptionSchema.pre('validate', function ensureSerialNumber(next) {
  if (!this.serialNumber) {
    this.serialNumber = buildPrescriptionSerialNumber(this._id);
  }
  next();
});

export default mongoose.model('Prescription', prescriptionSchema);
