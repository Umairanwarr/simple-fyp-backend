import {
  Doctor,
  MedicalStore,
  Patient,
  fetchPatientFavoriteDoctors,
  fetchPatientFavoriteStores,
  mapFavoriteDoctorIdStrings,
  mapFavoriteStoreIdStrings,
  mongoose
} from './shared.js';

export const getPatientFavoriteDoctors = async (req, res) => {
  try {
    const patient = await Patient.findById(req.user?.id)
      .select('favoriteDoctorIds favoriteStoreIds')
      .lean();

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const favoriteDoctorIds = mapFavoriteDoctorIdStrings(patient);
    const favoriteStoreIds = mapFavoriteStoreIdStrings(patient);

    const [doctors, stores] = await Promise.all([
      fetchPatientFavoriteDoctors(favoriteDoctorIds),
      fetchPatientFavoriteStores(favoriteStoreIds)
    ]);

    const combinedFavorites = [...doctors, ...stores];

    return res.status(200).json({
      doctors: combinedFavorites,
      favoriteDoctorIds: doctors.map((doctor) => String(doctor.id)),
      favoriteStoreIds: stores.map((store) => String(store.id))
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

    const patient = await Patient.findById(req.user?.id).select('favoriteDoctorIds favoriteStoreIds');

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const normalizedId = String(doctorId).trim();
    
    // Check if it's a doctor or a store
    const [doctor, store] = await Promise.all([
      Doctor.findOne({ _id: normalizedId, applicationStatus: { $ne: 'declined' }, emailVerified: true }).select('_id').lean(),
      MedicalStore.findOne({ _id: normalizedId, applicationStatus: 'approved', emailVerified: true }).select('_id').lean()
    ]);

    if (!doctor && !store) {
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
    }

    const favoriteDoctorIds = mapFavoriteDoctorIdStrings(patient);
    const favoriteStoreIds = mapFavoriteStoreIdStrings(patient);

    const [doctors, stores] = await Promise.all([
      fetchPatientFavoriteDoctors(favoriteDoctorIds),
      fetchPatientFavoriteStores(favoriteStoreIds)
    ]);

    return res.status(200).json({
      message: 'Added to favorites',
      doctors: [...doctors, ...stores],
      favoriteDoctorIds: doctors.map((d) => String(d.id)),
      favoriteStoreIds: stores.map((s) => String(s.id))
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

    const patient = await Patient.findById(req.user?.id).select('favoriteDoctorIds favoriteStoreIds');

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const normalizedId = String(doctorId).trim();
    
    patient.favoriteDoctorIds = mapFavoriteDoctorIdStrings(patient).filter(id => id !== normalizedId);
    patient.favoriteStoreIds = mapFavoriteStoreIdStrings(patient).filter(id => id !== normalizedId);
    
    await patient.save();

    const [doctors, stores] = await Promise.all([
      fetchPatientFavoriteDoctors(patient.favoriteDoctorIds),
      fetchPatientFavoriteStores(patient.favoriteStoreIds)
    ]);

    return res.status(200).json({
      message: 'Removed from favorites',
      doctors: [...doctors, ...stores],
      favoriteDoctorIds: doctors.map((d) => String(d.id)),
      favoriteStoreIds: stores.map((s) => String(s.id))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update favorites', error: error.message });
  }
};
