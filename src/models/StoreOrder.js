import mongoose from 'mongoose';

const prescriptionSchema = new mongoose.Schema({
  url:          { type: String, required: true },
  publicId:     { type: String, required: true },
  resourceType: { type: String, default: 'image' },
  format:       { type: String, default: null },
  originalName: { type: String, default: null },
  bytes:        { type: Number, default: null }
});

const storeOrderSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicalStore',
      required: true,
      index: true
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      default: null
    },
    // External (non-registered) patient details
    patientName: { type: String, required: true, trim: true },
    patientPhone: { type: String, default: '', trim: true },
    patientEmail: { type: String, default: '', trim: true, lowercase: true },

    // What they need
    notes: { type: String, default: '' },

    // Prescription files uploaded by the patient
    prescriptions: [prescriptionSchema],

    status: {
      type: String,
      enum: ['pending', 'reviewing', 'ready', 'completed', 'cancelled'],
      default: 'pending'
    },

    // Internal store notes
    storeNote: { type: String, default: '' }
  },
  { timestamps: true }
);

export const StoreOrder = mongoose.model('StoreOrder', storeOrderSchema);
