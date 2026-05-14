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
      required: true,
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
      enum: ['confirmed', 'cancelled'],
      default: 'confirmed'
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
    }
  },
  {
    timestamps: true
  }
);

clinicDoctorAppointmentSchema.index({ clinicId: 1, doctorId: 1, appointmentDate: 1, fromTime: 1 });

export const ClinicDoctorAppointment = mongoose.model('ClinicDoctorAppointment', clinicDoctorAppointmentSchema);
