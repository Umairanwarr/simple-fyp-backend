import mongoose from 'mongoose';

const liveStreamSchema = new mongoose.Schema(
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
    doctorAvatar: {
      type: String,
      default: ''
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000
    },
    channelName: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['scheduled', 'live', 'ended'],
      default: 'scheduled',
      index: true
    },
    scheduledAt: {
      type: Date,
      default: null
    },
    startedAt: {
      type: Date,
      default: null
    },
    endedAt: {
      type: Date,
      default: null
    },
    adminTerminationReason: {
      type: String,
      default: null
    },
    invitedGuests: [
      {
        odIf: { type: mongoose.Schema.Types.ObjectId },
        odModel: { type: String, enum: ['Doctor', 'Patient'], default: 'Doctor' },
        name: { type: String, default: '' },
        status: { type: String, enum: ['pending', 'accepted', 'rejected', 'joined'], default: 'pending' }
      }
    ],
    viewerCount: {
      type: Number,
      default: 0,
      min: 0
    },
    maxViewers: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

liveStreamSchema.index({ scheduledAt: 1 });
liveStreamSchema.index({ createdAt: -1 });

export const LiveStream = mongoose.model('LiveStream', liveStreamSchema);
