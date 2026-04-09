import {
  Doctor,
  Patient,
  fetchPatientFavoriteDoctors,
  mapFavoriteDoctorIdStrings,
  mongoose
} from './shared.js';

export const getPatientFavoriteDoctors = async (req, res) => {
  try {
    const patient = await Patient.findById(req.user?.id)
      .select('favoriteDoctorIds')
      .lean();

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const favoriteDoctorIds = mapFavoriteDoctorIdStrings(patient);
    const doctors = await fetchPatientFavoriteDoctors(favoriteDoctorIds);

    return res.status(200).json({
      doctors,
      favoriteDoctorIds: doctors.map((doctor) => String(doctor.id))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch favorite doctors', error: error.message });
  }
};

export const addDoctorToPatientFavorites = async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: 'Invalid doctor id' });
    }

    const patient = await Patient.findById(req.user?.id).select('favoriteDoctorIds');

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const normalizedDoctorId = String(doctorId).trim();
    const existingFavoriteDoctorIds = mapFavoriteDoctorIdStrings(patient);
    const isAlreadyFavorite = existingFavoriteDoctorIds.includes(normalizedDoctorId);

    if (!isAlreadyFavorite) {
      const doctor = await Doctor.findOne({
        _id: normalizedDoctorId,
        applicationStatus: { $ne: 'declined' },
        emailVerified: true
      })
        .select('_id')
        .lean();

      if (!doctor) {
        return res.status(404).json({ message: 'Doctor not found' });
      }

      patient.favoriteDoctorIds = [...existingFavoriteDoctorIds, normalizedDoctorId];
      await patient.save();
    }

    const favoriteDoctorIds = mapFavoriteDoctorIdStrings(patient);
    const doctors = await fetchPatientFavoriteDoctors(favoriteDoctorIds);

    return res.status(200).json({
      message: 'Doctor added to favorites',
      doctors,
      favoriteDoctorIds: doctors.map((doctor) => String(doctor.id))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update favorites', error: error.message });
  }
};

export const removeDoctorFromPatientFavorites = async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: 'Invalid doctor id' });
    }

    const patient = await Patient.findById(req.user?.id).select('favoriteDoctorIds');

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const normalizedDoctorId = String(doctorId).trim();
    const nextFavoriteDoctorIds = mapFavoriteDoctorIdStrings(patient)
      .filter((favoriteDoctorId) => favoriteDoctorId !== normalizedDoctorId);

    patient.favoriteDoctorIds = nextFavoriteDoctorIds;
    await patient.save();

    const doctors = await fetchPatientFavoriteDoctors(nextFavoriteDoctorIds);

    return res.status(200).json({
      message: 'Doctor removed from favorites',
      doctors,
      favoriteDoctorIds: doctors.map((doctor) => String(doctor.id))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update favorites', error: error.message });
  }
};
