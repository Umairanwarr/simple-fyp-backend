import {
  Doctor,
  DoctorProfileVisit,
  Patient,
  escapeRegex,
  getDoctorAvatarUrl,
  mapDoctorForPatientDirectory,
  mapDoctorSlotsByModeForPatientProfile,
  mapFavoriteDoctorIdStrings,
  mongoose
} from './shared.js';
import { DoctorMedia } from '../../../models/DoctorMedia.js';

export const getDoctorProfileForPatient = async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: 'Invalid doctor id' });
    }

    const patient = await Patient.findById(req.user?.id)
      .select('_id favoriteDoctorIds')
      .lean();

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const doctor = await Doctor.findOne({
      _id: doctorId,
      applicationStatus: { $ne: 'declined' },
      emailVerified: true
    })
      .select('fullName specialization address bio avatarDocument availabilitySlots profileCtr reviews averageRating totalReviews')
      .lean();

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const now = new Date();
    const visitUpdateResult = await DoctorProfileVisit.updateOne(
      {
        doctorId: doctor._id,
        patientId: patient._id
      },
      {
        $set: {
          lastVisitedAt: now
        },
        $setOnInsert: {
          doctorId: doctor._id,
          patientId: patient._id,
          firstVisitedAt: now
        }
      },
      {
        upsert: true
      }
    );

    let profileCtr = Math.max(0, Math.trunc(Number(doctor.profileCtr || 0)));
    const isUniqueProfileVisit = Number(visitUpdateResult?.upsertedCount || 0) > 0;

    if (isUniqueProfileVisit) {
      const ctrUpdateResult = await Doctor.findByIdAndUpdate(
        doctor._id,
        {
          $inc: {
            profileCtr: 1
          }
        },
        {
          new: true
        }
      )
        .select('profileCtr')
        .lean();

      profileCtr = Math.max(0, Math.trunc(Number(ctrUpdateResult?.profileCtr || (profileCtr + 1))));
    }

    const favoriteDoctorIdSet = new Set(mapFavoriteDoctorIdStrings(patient));
    const approvedMedia = await DoctorMedia.find({
      doctorId: doctor._id,
      deletedAt: null,
      moderationStatus: 'approved'
    })
      .select('mediaType asset createdAt reviewedAt')
      .sort({ reviewedAt: -1, createdAt: -1 })
      .limit(24)
      .lean();

    return res.status(200).json({
      doctor: {
        id: String(doctor._id),
        name: String(doctor.fullName || '').trim() || 'Doctor',
        specialty: String(doctor.specialization || '').trim() || 'Specialist',
        location: String(doctor.address || '').trim() || 'Location not provided',
        bio: String(doctor.bio || '').trim() || 'Doctor bio is not available yet.',
        rating: doctor.averageRating ? doctor.averageRating.toFixed(2) : '0.00',
        reviews: `${doctor.totalReviews || 0} reviews`,
        reviewsList: doctor.reviews || [],
        gallery: approvedMedia.map((mediaItem) => ({
          id: String(mediaItem?._id || ''),
          mediaType: String(mediaItem?.mediaType || '').trim().toLowerCase() === 'video' ? 'video' : 'image',
          url: String(mediaItem?.asset?.url || '').trim(),
          uploadedAt: mediaItem?.createdAt || null
        })),
        image: getDoctorAvatarUrl(doctor) || '/topdoc.svg',
        isFavorite: favoriteDoctorIdSet.has(String(doctor._id))
      },
      slotsByMode: mapDoctorSlotsByModeForPatientProfile(doctor),
      profileCtr
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch doctor profile', error: error.message });
  }
};

export const searchDoctorsForPatients = async (req, res) => {
  try {
    const rawQuery = String(req.query?.q || req.query?.query || '').trim();
    const rawSpecialty = String(req.query?.specialty || '').trim();
    const queryTokens = rawQuery
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    const filters = {
      applicationStatus: { $ne: 'declined' },
      emailVerified: true
    };

    if (rawSpecialty) {
      filters.specialization = {
        $regex: escapeRegex(rawSpecialty),
        $options: 'i'
      };
    }

    const doctors = await Doctor.find(filters)
      .select('fullName specialization licenseNumber experience address bio avatarDocument availabilitySlots averageRating totalReviews')
      .sort({ updatedAt: -1 })
      .limit(250)
      .lean();

    const filteredDoctors = queryTokens.length === 0
      ? doctors
      : doctors.filter((doctor) => {
          const searchableText = [
            doctor.fullName,
            doctor.specialization,
            doctor.address,
            doctor.licenseNumber,
            doctor.bio
          ]
            .join(' ')
            .toLowerCase();

          return queryTokens.some((token) => searchableText.includes(token));
        });

    return res.status(200).json({
      doctors: filteredDoctors.map((doctor) => mapDoctorForPatientDirectory(doctor))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch doctors for search', error: error.message });
  }
};
