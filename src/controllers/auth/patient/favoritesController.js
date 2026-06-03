import {
  Doctor,
  MedicalStore,
  Clinic,
  Patient,
  fetchPatientFavoriteDoctors,
  fetchPatientFavoriteStores,
  fetchPatientFavoriteClinics,
  mapFavoriteDoctorIdStrings,
  mapFavoriteStoreIdStrings,
  mapFavoriteClinicIdStrings,
  mongoose
} from './shared.js';

export const getPatientFavoriteDoctors = async (req, res) => {
  try {
    const patient = await Patient.findById(req.user?.id)
      .select('favoriteDoctorIds favoriteStoreIds favoriteClinicIds')
      .lean();

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const favoriteDoctorIds = mapFavoriteDoctorIdStrings(patient);
    const favoriteStoreIds = mapFavoriteStoreIdStrings(patient);
    const favoriteClinicIds = mapFavoriteClinicIdStrings(patient);

    const [doctors, stores, clinics] = await Promise.all([
      fetchPatientFavoriteDoctors(favoriteDoctorIds),
      fetchPatientFavoriteStores(favoriteStoreIds),
      fetchPatientFavoriteClinics(favoriteClinicIds)
    ]);

    const combinedFavorites = [...doctors, ...stores, ...clinics];

    return res.status(200).json({
      doctors: combinedFavorites,
      favoriteDoctorIds: doctors.map((doctor) => String(doctor.id)),
      favoriteStoreIds: stores.map((store) => String(store.id)),
      favoriteClinicIds: clinics.map((clinic) => String(clinic.id))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch favorite doctors', error: error.message });
  }
};

export const addDoctorToPatientFavorites = async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const patient = await Patient.findById(req.user?.id).select('favoriteDoctorIds favoriteStoreIds favoriteClinicIds');

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const normalizedId = String(doctorId).trim();
    
    // Check if it's a doctor, store, or clinic
    const [doctor, store, clinic] = await Promise.all([
      Doctor.findOne({ _id: normalizedId, applicationStatus: { $ne: 'declined' }, emailVerified: true }).select('_id').lean(),
      MedicalStore.findOne({ _id: normalizedId, applicationStatus: 'approved', emailVerified: true }).select('_id').lean(),
      Clinic.findOne({ _id: normalizedId, applicationStatus: { $ne: 'declined' }, emailVerified: true }).select('_id').lean()
    ]);

    if (!doctor && !store && !clinic) {
      return res.status(404).json({ message: 'Entity not found' });
    }

    if (doctor) {
      const existingFavoriteDoctorIds = mapFavoriteDoctorIdStrings(patient);
      if (!existingFavoriteDoctorIds.includes(normalizedId)) {
        patient.favoriteDoctorIds = [...existingFavoriteDoctorIds, normalizedId];
        await patient.save();
      }
    } else if (store) {
      const existingFavoriteStoreIds = mapFavoriteStoreIdStrings(patient);
      if (!existingFavoriteStoreIds.includes(normalizedId)) {
        patient.favoriteStoreIds = [...existingFavoriteStoreIds, normalizedId];
        await patient.save();
      }
    } else if (clinic) {
      const existingFavoriteClinicIds = mapFavoriteClinicIdStrings(patient);
      if (!existingFavoriteClinicIds.includes(normalizedId)) {
        patient.favoriteClinicIds = [...existingFavoriteClinicIds, normalizedId];
        await patient.save();
      }
    }

    const favoriteDoctorIds = mapFavoriteDoctorIdStrings(patient);
    const favoriteStoreIds = mapFavoriteStoreIdStrings(patient);
    const favoriteClinicIds = mapFavoriteClinicIdStrings(patient);

    const [doctors, stores, clinics] = await Promise.all([
      fetchPatientFavoriteDoctors(favoriteDoctorIds),
      fetchPatientFavoriteStores(favoriteStoreIds),
      fetchPatientFavoriteClinics(favoriteClinicIds)
    ]);

    return res.status(200).json({
      message: 'Added to favorites',
      doctors: [...doctors, ...stores, ...clinics],
      favoriteDoctorIds: doctors.map((d) => String(d.id)),
      favoriteStoreIds: stores.map((s) => String(s.id)),
      favoriteClinicIds: clinics.map((c) => String(c.id))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update favorites', error: error.message });
  }
};

export const removeDoctorFromPatientFavorites = async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const patient = await Patient.findById(req.user?.id).select('favoriteDoctorIds favoriteStoreIds favoriteClinicIds');

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const normalizedId = String(doctorId).trim();
    
    patient.favoriteDoctorIds = mapFavoriteDoctorIdStrings(patient).filter(id => id !== normalizedId);
    patient.favoriteStoreIds = mapFavoriteStoreIdStrings(patient).filter(id => id !== normalizedId);
    patient.favoriteClinicIds = mapFavoriteClinicIdStrings(patient).filter(id => id !== normalizedId);
    
    await patient.save();

    const [doctors, stores, clinics] = await Promise.all([
      fetchPatientFavoriteDoctors(patient.favoriteDoctorIds),
      fetchPatientFavoriteStores(patient.favoriteStoreIds),
      fetchPatientFavoriteClinics(patient.favoriteClinicIds)
    ]);

    return res.status(200).json({
      message: 'Removed from favorites',
      doctors: [...doctors, ...stores, ...clinics],
      favoriteDoctorIds: doctors.map((d) => String(d.id)),
      favoriteStoreIds: stores.map((s) => String(s.id)),
      favoriteClinicIds: clinics.map((c) => String(c.id))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update favorites', error: error.message });
  }
};
