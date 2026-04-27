import mongoose from 'mongoose';

const storeChatMessageSchema = new mongoose.Schema(
  {
    from: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'fromModel'
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'toModel'
    },
    fromModel: {
      type: String,
      required: true,
      enum: ['Patient', 'MedicalStore']
    },
    toModel: {
      type: String,
      required: true,
      enum: ['Patient', 'MedicalStore']
    },
    content: {
      type: String,
      default: ''
    },
    attachment: {
      url: { type: String, default: '' },
      type: { type: String, default: '' }
    },
    readAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('StoreChatMessage', storeChatMessageSchema);
