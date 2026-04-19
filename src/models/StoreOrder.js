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
    patientImage: { type: String, default: '' },

    // Cart items
    items: [
      {
        medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true }
      }
    ],
    totalAmount: { type: Number, required: true, default: 0 },
    notes: { type: String, default: '' },

    // Payment
    paymentMethod: { type: String, enum: ['stripe', 'cod'], default: 'cod' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded', 'failed'], default: 'pending' },
    stripePaymentIntentId: { type: String, default: null },

    // Prescription files uploaded by the patient
    prescriptions: [prescriptionSchema],

    status: {
      type: String,
      enum: [
        'pending', 'reviewing', 'accepted', 'ready', 'completed', 'cancelled',
        // Delivery pipeline stages (set after order is accepted)
        'Processing', 'Processed', 'Dispatched', 'Delivered'
      ],
      default: 'pending'
    },

    // Internal store notes & rejection reason
    storeNote: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },

    // Patient's post-delivery review of the store
    reviewStatus: {
      type: String,
      enum: ['pending', 'submitted', 'skipped'],
      default: null   // null = not yet eligible
    },
    reviewRating: { type: Number, default: null, min: 1, max: 5 },
    reviewComment: { type: String, default: '', maxlength: 1000 },
    reviewedAt: { type: Date, default: null },
    reviewSkippedAt: { type: Date, default: null },
    reviewSkipConfirmed: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const StoreOrder = mongoose.model('StoreOrder', storeOrderSchema);
