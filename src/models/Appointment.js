import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true
    },
    doctorName: {
      type: String,
      required: true,
      trim: true
    },
    patientName: {
      type: String,
      required: true,
      trim: true
    },
    patientEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    doctorAvatarUrl: {
      type: String,
      default: '',
      trim: true
    },
    contactPhoneNumber: {
      type: String,
      required: true,
      trim: true
    },
    contactAddress: {
      streetAddress: {
        type: String,
        required: true,
        trim: true
      },
      aptSuite: {
        type: String,
        default: '',
        trim: true
      },
      city: {
        type: String,
        required: true,
        trim: true
      },
      state: {
        type: String,
        required: true,
        trim: true
      },
      zip: {
        type: String,
        required: true,
        trim: true
      }
    },
    slotId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    appointmentDate: {
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
      enum: ['online', 'offline'],
      required: true
    },
    amountInRupees: {
      type: Number,
      required: true,
      min: 0
    },
    adminCommissionInRupees: {
      type: Number,
      required: true,
      min: 0
    },
    doctorPayoutInRupees: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'pkr',
      trim: true,
      lowercase: true
    },
    paymentIntentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    paymentStatus: {
      type: String,
      enum: ['requires_payment', 'succeeded', 'failed', 'canceled'],
      default: 'requires_payment'
    },
    bookingStatus: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending'
    },
    cancelledAt: {
      type: Date,
      default: null
    },
    cancelledByRole: {
      type: String,
      default: '',
      trim: true,
      lowercase: true
    },
    rescheduledAt: {
      type: Date,
      default: null
    },
    rescheduledByRole: {
      type: String,
      default: '',
      trim: true,
      lowercase: true
    },
    rescheduleReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500
    },
    previousAppointmentDate: {
      type: String,
      default: '',
      trim: true
    },
    previousFromTime: {
      type: String,
      default: '',
      trim: true
    },
    previousToTime: {
      type: String,
      default: '',
      trim: true
    },
    refundStatus: {
      type: String,
      enum: ['not_requested', 'pending', 'succeeded', 'failed', 'not_applicable'],
      default: 'not_requested'
    },
    refundAmountInRupees: {
      type: Number,
      default: 0,
      min: 0
    },
    refundId: {
      type: String,
      default: '',
      trim: true
    },
    refundFailureReason: {
      type: String,
      default: '',
      trim: true
    },
    refundedAt: {
      type: Date,
      default: null
    },
    cancellationAcknowledgedNoRefund: {
      type: Boolean,
      default: false
    },
    reviewStatus: {
      type: String,
      enum: ['pending', 'submitted', 'skipped'],
      default: 'pending'
    },
    reviewRating: {
      type: Number,
      default: null,
      min: 1,
      max: 5
    },
    reviewComment: {
      type: String,
      default: '',
      maxlength: 1000,
      trim: true
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    reviewSkippedAt: {
      type: Date,
      default: null
    },
    reviewSkipConfirmed: {
      type: Boolean,
      default: false
    },
    paymentMethodBrand: {
      type: String,
      default: '',
      trim: true
    },
    paymentMethodLast4: {
      type: String,
      default: '',
      trim: true
    },
    paidAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

appointmentSchema.index(
  {
    doctorId: 1,
    slotId: 1,
    bookingStatus: 1
  },
  {
    unique: true,
    partialFilterExpression: {
      bookingStatus: 'confirmed'
    },
    name: 'unique_confirmed_doctor_slot_booking'
  }
);

export const Appointment = mongoose.model('Appointment', appointmentSchema);
