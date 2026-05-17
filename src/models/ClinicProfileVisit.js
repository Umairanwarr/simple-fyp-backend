import mongoose from 'mongoose';

const clinicProfileVisitSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
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

clinicProfileVisitSchema.index(
  { clinicId: 1, patientId: 1 },
  { unique: true, name: 'unique_clinic_patient_profile_visit' }
);

export const ClinicProfileVisit = mongoose.model('ClinicProfileVisit', clinicProfileVisitSchema);
