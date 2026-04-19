import Prescription from '../../../models/Prescription.js';

export const getPatientPrescriptions = async (req, res) => {
  try {
    const patientId = String(req.user.id || '').trim();
    
    const prescriptions = await Prescription.find({ patientId })
      .populate('doctorId', 'fullName avatarDocument specialization')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ prescriptions });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch prescriptions' });
  }
};
