import { Admin } from '../../models/Admin.js';
import { Clinic } from '../../models/Clinic.js';
import { Doctor } from '../../models/Doctor.js';
import { MedicalStore } from '../../models/MedicalStore.js';
import { Patient } from '../../models/Patient.js';
import { sendClinicApplicationStatusEmail } from '../../services/mailService.js';
import { sendDoctorApplicationStatusEmail } from '../../services/mailService.js';
import { sendMedicalStoreApplicationStatusEmail } from '../../services/mailService.js';
import { generateAuthToken } from '../../utils/token.js';
import mongoose from 'mongoose';

export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const admin = await Admin.findOne({ email: String(email).toLowerCase().trim() });

    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await admin.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateAuthToken(
      { id: admin._id, email: admin.email, role: admin.role },
      '24h'
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getPatientsForAdmin = async (req, res) => {
  try {
    const patients = await Patient.find()
      .sort({ createdAt: -1 })
      .select('firstName lastName email isVerified createdAt');

    const normalizedPatients = patients.map((patient) => ({
      id: patient._id,
      name: `${patient.firstName} ${patient.lastName}`.trim(),
      email: patient.email,
      joined: patient.createdAt,
      status: patient.isVerified ? 'Active' : 'Pending Verification'
    }));

    return res.status(200).json({ patients: normalizedPatients });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getAdminStats = async (req, res) => {
  try {
    const totalPatients = await Patient.countDocuments();
    const verifiedPatients = await Patient.countDocuments({ isVerified: true });
    const totalDoctors = await Doctor.countDocuments();
    const approvedDoctors = await Doctor.countDocuments({ applicationStatus: 'approved' });
    const totalClinics = await Clinic.countDocuments();
    const approvedClinics = await Clinic.countDocuments({ applicationStatus: 'approved' });
    const totalMedicalStores = await MedicalStore.countDocuments();
    const approvedMedicalStores = await MedicalStore.countDocuments({ applicationStatus: 'approved' });

    return res.status(200).json({
      totalPatients,
      verifiedPatients,
      totalDoctors,
      approvedDoctors,
      totalClinics,
      approvedClinics,
      totalMedicalStores,
      approvedMedicalStores
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const deletePatientForAdmin = async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ message: 'Invalid patient id' });
    }

    const deletedPatient = await Patient.findByIdAndDelete(patientId);

    if (!deletedPatient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    return res.status(200).json({ message: 'Patient deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getDoctorsForAdmin = async (req, res) => {
  try {
    const doctors = await Doctor.find()
      .sort({ createdAt: -1 })
      .select(
        'fullName email phone specialization licenseNumber experience address licenseDocument emailVerified applicationStatus adminReviewNote reviewedAt createdAt'
      );

    const normalizedDoctors = doctors.map((doctor) => ({
      id: doctor._id,
      fullName: doctor.fullName,
      email: doctor.email,
      phone: doctor.phone,
      specialization: doctor.specialization,
      licenseNumber: doctor.licenseNumber,
      experience: doctor.experience,
      address: doctor.address,
      licenseDocument: doctor.licenseDocument,
      emailVerified: doctor.emailVerified,
      applicationStatus: doctor.applicationStatus,
      adminReviewNote: doctor.adminReviewNote,
      reviewedAt: doctor.reviewedAt,
      joinedAt: doctor.createdAt
    }));

    return res.status(200).json({ doctors: normalizedDoctors });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const reviewDoctorApplicationForAdmin = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const {
      status,
      applicationStatus,
      decision,
      note = '',
      reviewNote = ''
    } = req.body;

    const incomingStatus = String(
      status || applicationStatus || decision || req.query?.status || ''
    )
      .trim()
      .toLowerCase();

    const normalizedStatus = incomingStatus === 'approve'
      ? 'approved'
      : incomingStatus === 'decline'
        ? 'declined'
        : incomingStatus;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: 'Invalid doctor id' });
    }

    if (!['approved', 'declined'].includes(normalizedStatus)) {
      return res.status(400).json({ message: 'Status must be either approved or declined' });
    }

    const doctor = await Doctor.findById(doctorId);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    doctor.applicationStatus = normalizedStatus;
    doctor.adminReviewNote = String(note || reviewNote || '').trim();
    doctor.reviewedAt = new Date();
    doctor.reviewedBy = req.user?.id || null;
    await doctor.save();

    await sendDoctorApplicationStatusEmail({
      to: doctor.email,
      fullName: doctor.fullName,
      status: normalizedStatus
    });

    return res.status(200).json({
      message: `Doctor application ${normalizedStatus} successfully`,
      doctor: {
        id: doctor._id,
        fullName: doctor.fullName,
        email: doctor.email,
        phone: doctor.phone,
        specialization: doctor.specialization,
        licenseNumber: doctor.licenseNumber,
        experience: doctor.experience,
        address: doctor.address,
        licenseDocument: doctor.licenseDocument,
        emailVerified: doctor.emailVerified,
        applicationStatus: doctor.applicationStatus,
        adminReviewNote: doctor.adminReviewNote,
        reviewedAt: doctor.reviewedAt,
        joinedAt: doctor.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getClinicsForAdmin = async (req, res) => {
  try {
    const clinics = await Clinic.find()
      .sort({ createdAt: -1 })
      .select(
        'name email phone facilityType address permitDocument emailVerified applicationStatus adminReviewNote reviewedAt createdAt'
      );

    const normalizedClinics = clinics.map((clinic) => ({
      id: clinic._id,
      name: clinic.name,
      email: clinic.email,
      phone: clinic.phone,
      facilityType: clinic.facilityType,
      address: clinic.address,
      permitDocument: clinic.permitDocument,
      emailVerified: clinic.emailVerified,
      applicationStatus: clinic.applicationStatus,
      adminReviewNote: clinic.adminReviewNote,
      reviewedAt: clinic.reviewedAt,
      joinedAt: clinic.createdAt
    }));

    return res.status(200).json({ clinics: normalizedClinics });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const reviewClinicApplicationForAdmin = async (req, res) => {
  try {
    const { clinicId } = req.params;
    const {
      status,
      applicationStatus,
      decision,
      note = '',
      reviewNote = ''
    } = req.body;

    const incomingStatus = String(
      status || applicationStatus || decision || req.query?.status || ''
    )
      .trim()
      .toLowerCase();

    const normalizedStatus = incomingStatus === 'approve'
      ? 'approved'
      : incomingStatus === 'decline'
        ? 'declined'
        : incomingStatus;

    if (!mongoose.Types.ObjectId.isValid(clinicId)) {
      return res.status(400).json({ message: 'Invalid clinic id' });
    }

    if (!['approved', 'declined'].includes(normalizedStatus)) {
      return res.status(400).json({ message: 'Status must be either approved or declined' });
    }

    const clinic = await Clinic.findById(clinicId);

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    clinic.applicationStatus = normalizedStatus;
    clinic.adminReviewNote = String(note || reviewNote || '').trim();
    clinic.reviewedAt = new Date();
    clinic.reviewedBy = req.user?.id || null;
    await clinic.save();

    await sendClinicApplicationStatusEmail({
      to: clinic.email,
      clinicName: clinic.name,
      status: normalizedStatus
    });

    return res.status(200).json({
      message: `Clinic application ${normalizedStatus} successfully`,
      clinic: {
        id: clinic._id,
        name: clinic.name,
        email: clinic.email,
        phone: clinic.phone,
        facilityType: clinic.facilityType,
        address: clinic.address,
        permitDocument: clinic.permitDocument,
        emailVerified: clinic.emailVerified,
        applicationStatus: clinic.applicationStatus,
        adminReviewNote: clinic.adminReviewNote,
        reviewedAt: clinic.reviewedAt,
        joinedAt: clinic.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getMedicalStoresForAdmin = async (req, res) => {
  try {
    const stores = await MedicalStore.find()
      .sort({ createdAt: -1 })
      .select(
        'name email phone licenseNumber address operatingHours licenseDocument emailVerified applicationStatus adminReviewNote reviewedAt createdAt'
      );

    const normalizedStores = stores.map((store) => ({
      id: store._id,
      name: store.name,
      email: store.email,
      phone: store.phone,
      licenseNumber: store.licenseNumber,
      address: store.address,
      operatingHours: store.operatingHours,
      licenseDocument: store.licenseDocument,
      emailVerified: store.emailVerified,
      applicationStatus: store.applicationStatus,
      adminReviewNote: store.adminReviewNote,
      reviewedAt: store.reviewedAt,
      joinedAt: store.createdAt
    }));

    return res.status(200).json({ stores: normalizedStores });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const reviewMedicalStoreApplicationForAdmin = async (req, res) => {
  try {
    const { storeId } = req.params;
    const {
      status,
      applicationStatus,
      decision,
      note = '',
      reviewNote = ''
    } = req.body;

    const incomingStatus = String(
      status || applicationStatus || decision || req.query?.status || ''
    )
      .trim()
      .toLowerCase();

    const normalizedStatus = incomingStatus === 'approve'
      ? 'approved'
      : incomingStatus === 'decline'
        ? 'declined'
        : incomingStatus;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json({ message: 'Invalid medical store id' });
    }

    if (!['approved', 'declined'].includes(normalizedStatus)) {
      return res.status(400).json({ message: 'Status must be either approved or declined' });
    }

    const store = await MedicalStore.findById(storeId);

    if (!store) {
      return res.status(404).json({ message: 'Medical store not found' });
    }

    store.applicationStatus = normalizedStatus;
    store.adminReviewNote = String(note || reviewNote || '').trim();
    store.reviewedAt = new Date();
    store.reviewedBy = req.user?.id || null;
    await store.save();

    await sendMedicalStoreApplicationStatusEmail({
      to: store.email,
      storeName: store.name,
      status: normalizedStatus
    });

    return res.status(200).json({
      message: `Medical store application ${normalizedStatus} successfully`,
      store: {
        id: store._id,
        name: store.name,
        email: store.email,
        phone: store.phone,
        licenseNumber: store.licenseNumber,
        address: store.address,
        operatingHours: store.operatingHours,
        licenseDocument: store.licenseDocument,
        emailVerified: store.emailVerified,
        applicationStatus: store.applicationStatus,
        adminReviewNote: store.adminReviewNote,
        reviewedAt: store.reviewedAt,
        joinedAt: store.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
