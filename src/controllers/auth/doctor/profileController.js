import {
  Doctor,
  deleteFromCloudinary,
  mapDoctorProfilePayload,
  mapDoctorSessionPayload,
  uploadUserAvatarToCloudinary
} from './shared.js';

export const getDoctorProfile = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user?.id);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    return res.status(200).json({
      profile: mapDoctorProfilePayload(doctor),
      doctor: mapDoctorSessionPayload(doctor)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch doctor profile', error: error.message });
  }
};

export const updateDoctorProfile = async (req, res) => {
  try {
    const fullName = String(req.body?.fullName || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const address = String(req.body?.address || '').trim();
    const bio = String(req.body?.bio || '').trim();
    const missingFields = [];

    if (!fullName) {
      missingFields.push('name');
    }

    if (!phone) {
      missingFields.push('phone');
    }

    if (!address) {
      missingFields.push('address');
    }

    if (!bio) {
      missingFields.push('bio');
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: 'Name, phone number, clinic address, and bio are required',
        missingFields
      });
    }

    const doctor = await Doctor.findById(req.user?.id);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    doctor.fullName = fullName;
    doctor.phone = phone;
    doctor.address = address;
    doctor.bio = bio;
    await doctor.save();

    return res.status(200).json({
      message: 'Profile updated successfully',
      profile: mapDoctorProfilePayload(doctor),
      doctor: mapDoctorSessionPayload(doctor)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update doctor profile', error: error.message });
  }
};

export const updateDoctorAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Avatar image file is required' });
    }

    const doctor = await Doctor.findById(req.user?.id);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    if (doctor.avatarDocument?.publicId) {
      await deleteFromCloudinary(
        doctor.avatarDocument.publicId,
        doctor.avatarDocument.resourceType || 'image'
      );
    }

    const uploadedAvatar = await uploadUserAvatarToCloudinary(req.file, 'doctors');
    doctor.avatarDocument = uploadedAvatar;
    await doctor.save();

    return res.status(200).json({
      message: 'Avatar updated successfully',
      doctor: mapDoctorSessionPayload(doctor),
      profile: mapDoctorProfilePayload(doctor)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update avatar', error: error.message });
  }
};
