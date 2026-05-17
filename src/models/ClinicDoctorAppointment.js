import mongoose from 'mongoose';

const clinicDoctorAppointmentSchema = new mongoose.Schema(
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
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClinicDoctor',
      required: false,
      default: null,
      index: true
    },
    doctorName: {
      type: String,
      required: true,
      trim: true
    },
    doctorSpecialization: {
      type: String,
      default: '',
      trim: true
    },
    doctorAvatarUrl: {
      type: String,
      default: '',
      trim: true
    },
    providerType: {
      type: String,
      enum: ['doctor', 'service'],
      default: 'doctor',
      index: true
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClinicService',
      required: false,
      default: null,
      index: true
    },
    serviceName: {
      type: String,
      default: '',
      trim: true
    },
    serviceType: {
      type: String,
      enum: ['lab', 'facility', ''],
      default: '',
      trim: true,
      lowercase: true
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: false,
      index: true
    },
    patientName: {
      type: String,
      default: '',
      trim: true
    },
    patientPhone: {
      type: String,
      default: '',
      trim: true
    },
    patientEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true
    },
    contactAddress: {
      streetAddress: { type: String, default: '', trim: true },
      aptSuite: { type: String, default: '', trim: true },
      city: { type: String, default: '', trim: true },
      state: { type: String, default: '', trim: true },
      zip: { type: String, default: '', trim: true }
    },
    slotId: {
      type: String,
      default: '',
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
      enum: ['online', 'offline', 'video'],
      default: 'offline'
    },
    bookingStatus: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending'
    },
    paymentStatus: {
      type: String,
      enum: ['requires_payment', 'succeeded', 'failed', 'canceled'],
      default: 'requires_payment',
      index: true
    },
    paymentIntentId: {
      type: String,
      default: '',
      trim: true,
      index: true
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
    },
    amountInRupees: {
      type: Number,
      default: 0,
      min: 0
    },
    adminCommissionInRupees: {
      type: Number,
      default: 0,
      min: 0
    },
    clinicPayoutInRupees: {
      type: Number,
      default: 0,
      min: 0
    },
    currency: {
      type: String,
      default: 'pkr',
      trim: true,
      lowercase: true
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
    refundStatus: {
      type: String,
      default: '',
      trim: true,
      lowercase: true
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
    reviewStatus: {
      type: String,
      enum: ['pending', 'submitted', 'skipped'],
      default: 'pending',
      index: true
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
      trim: true,
      maxlength: 1000
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
    }
  },
  {
    timestamps: true
  }
);

clinicDoctorAppointmentSchema.index({ clinicId: 1, doctorId: 1, appointmentDate: 1, fromTime: 1 });
clinicDoctorAppointmentSchema.index({ clinicId: 1, serviceId: 1, appointmentDate: 1, fromTime: 1 });

export const ClinicDoctorAppointment = mongoose.model('ClinicDoctorAppointment', clinicDoctorAppointmentSchema);
