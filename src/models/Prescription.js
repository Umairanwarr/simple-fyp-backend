import mongoose from 'mongoose';

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

export default mongoose.model('Prescription', prescriptionSchema);
