import mongoose from 'mongoose';

const medicineSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicalStore',
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    brand: {
      type: String,
      required: true,
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    category: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['In Stock', 'Out of Stock'],
      default: 'In Stock'
    }
  },
  {
    timestamps: true
  }
);

export const Medicine = mongoose.model('Medicine', medicineSchema);
