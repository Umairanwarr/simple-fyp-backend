import mongoose from 'mongoose';

const withdrawRequestSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: false
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicalStore',
      required: false
    },
    amountInRupees: {
      type: Number,
      required: true,
      min: 5000
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    bankAccountTitle: { type: String, default: '' },
    bankAccountNumber: { type: String, default: '' },
    bankName: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' }
  },
  { timestamps: true }
);

export default mongoose.model('WithdrawRequest', withdrawRequestSchema);
