import mongoose from 'mongoose';

const doctorProfileVisitSchema = new mongoose.Schema(
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
    firstVisitedAt: {
      type: Date,
      default: Date.now
    },
    lastVisitedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

doctorProfileVisitSchema.index(
  { doctorId: 1, patientId: 1 },
  { unique: true, name: 'unique_doctor_patient_profile_visit' }
);

export const DoctorProfileVisit = mongoose.model('DoctorProfileVisit', doctorProfileVisitSchema);
