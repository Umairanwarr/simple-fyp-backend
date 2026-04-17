import Prescription from '../../../models/Prescription.js';
import { Appointment } from '../../../models/Appointment.js';
import { Patient } from '../../../models/Patient.js';
import { Doctor } from '../../../models/Doctor.js';
import { uploadPrescriptionToCloudinary, deleteFromCloudinary } from '../../../services/cloudinaryService.js';
import { sendPrescriptionEmail } from '../../../services/mailService.js';

export const getDoctorCompletedPatients = async (req, res) => {
  try {
    const doctorId = String(req.user.id || '').trim();

    const completedAppointments = await Appointment.find({
      doctorId,
      bookingStatus: 'confirmed',
      paymentStatus: 'succeeded'
    }).lean();

    const patientIds = [...new Set(completedAppointments.map(app => String(app.patientId)))];

    const patients = await Patient.find({ _id: { $in: patientIds } })
      .select('firstName lastName avatarDocument')
      .lean();

    const formattedPatients = patients.map(p => ({
      id: p._id,
      name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
      avatarUrl: String(p.avatarDocument?.url || '').trim()
    }));

    return res.json({ patients: formattedPatients });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch completed patients' });
  }
};

export const createDoctorPrescription = async (req, res) => {
  try {
    const doctorId = String(req.user.id || '').trim();
    const patientId = String(req.body.patientId || '').trim();
    const notes = String(req.body.notes || '').trim();

    if (!patientId) {
      return res.status(400).json({ message: 'Patient ID is required' });
    }

    if (!notes && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ message: 'Either notes or an image attachment must be provided' });
    }

    let attachmentUrl = null;
    let attachmentPublicId = null;
    let attachmentFileType = null;

    if (req.files && req.files.length > 0) {
      const uploadResult = await uploadPrescriptionToCloudinary(req.files[0]);
      attachmentUrl = uploadResult.url;
      attachmentPublicId = uploadResult.publicId;
      attachmentFileType = uploadResult.resourceType; // 'image' or 'raw'
    }

    const prescription = await Prescription.create({
      doctorId,
      patientId,
      notes,
      attachmentUrl,
      attachmentPublicId,
      attachmentFileType
    });

    // Send email + notification asynchronously (non-blocking)
    (async () => {
      try {
        const [patient, doctor] = await Promise.all([
          Patient.findById(patientId).select('firstName lastName email notificationsSeenAt').lean(),
          Doctor.findById(doctorId).select('fullName').lean()
        ]);

        if (patient && doctor) {
          const patientName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient';
          const doctorName = String(doctor.fullName || 'Your Doctor').trim();

          // Send email notification
          sendPrescriptionEmail({
            to: patient.email,
            patientName,
            doctorName
          }).catch(err => console.error('Prescription email error:', err));
        }
      } catch (notifyErr) {
        console.error('Prescription notification error:', notifyErr);
      }
    })();

    return res.status(201).json({ prescription });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not create prescription' });
  }
};

export const getDoctorPrescriptions = async (req, res) => {
  try {
    const doctorId = String(req.user.id || '').trim();
    const prescriptions = await Prescription.find({ doctorId })
      .populate('patientId', 'firstName lastName avatarDocument')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ prescriptions });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch prescriptions' });
  }
};

export const deleteDoctorPrescription = async (req, res) => {
  try {
    const doctorId = String(req.user.id || '').trim();
    const prescriptionId = String(req.params.prescriptionId || '').trim();

    const prescription = await Prescription.findOne({ _id: prescriptionId, doctorId });
    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found' });
    }

    // Delete from Cloudinary if there was an attachment
    if (prescription.attachmentPublicId) {
      const resourceType = prescription.attachmentFileType === 'raw' ? 'raw' : 'image';
      await deleteFromCloudinary(prescription.attachmentPublicId, resourceType).catch(() => {});
    }

    await Prescription.deleteOne({ _id: prescriptionId });

    return res.json({ message: 'Prescription deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not delete prescription' });
  }
};
