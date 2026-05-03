import { Clinic } from '../../models/Clinic.js';
import {
  deleteFromCloudinary,
  uploadClinicPermitToCloudinary,
  uploadUserAvatarToCloudinary
} from '../../services/cloudinaryService.js';
import { sendVerificationOtpEmail } from '../../services/mailService.js';
import { generateOtp, getOtpExpiryDate, hashOtp } from '../../utils/otp.js';
import { generateAuthToken } from '../../utils/token.js';

const normalizeEmail = (email) => String(email || '').toLowerCase().trim();

const getClinicAvatarUrl = (clinicRecord) => {
  return String(clinicRecord?.avatarDocument?.url || '').trim();
};

export const registerClinic = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      facilityType,
      address,
      password,
      confirmPassword
    } = req.body;

    if (!name || !email || !phone || !facilityType || !address || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All clinic registration fields are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const normalizedEmail = normalizeEmail(email);
    const existingClinic = await Clinic.findOne({ email: normalizedEmail });

    if (existingClinic?.applicationStatus === 'approved') {
      return res.status(409).json({ message: 'This clinic account is already approved. Please sign in.' });
    }

    if (existingClinic?.applicationStatus === 'pending' && existingClinic?.emailVerified) {
      return res.status(409).json({ message: 'Your clinic application is already submitted and under review.' });
    }

    let uploadedPermit = null;

    if (req.file) {
      uploadedPermit = await uploadClinicPermitToCloudinary(req.file);
    }

    if (!uploadedPermit && !existingClinic?.permitDocument?.url) {
      return res.status(400).json({ message: 'Health permit file is required' });
    }

    if (existingClinic?.permitDocument?.publicId && uploadedPermit) {
      await deleteFromCloudinary(
        existingClinic.permitDocument.publicId,
        existingClinic.permitDocument.resourceType
      );
    }

    const clinic = existingClinic || new Clinic();

    clinic.name = String(name).trim();
    clinic.email = normalizedEmail;
    clinic.phone = String(phone).trim();
    clinic.facilityType = String(facilityType).trim();
    clinic.address = String(address).trim();
    clinic.password = password;
    clinic.emailVerified = false;
    clinic.applicationStatus = 'pending';
    clinic.adminReviewNote = '';
    clinic.reviewedAt = null;
    clinic.reviewedBy = null;
    clinic.verificationOtpHash = null;
    clinic.verificationOtpExpiresAt = null;

    if (uploadedPermit) {
      clinic.permitDocument = uploadedPermit;
    }

    await clinic.save();

    return res.status(201).json({
      message: 'Clinic details submitted. Please verify your email with OTP.',
      email: clinic.email
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not register clinic', error: error.message });
  }
};

export const sendClinicVerificationOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const clinic = await Clinic.findOne({ email: normalizedEmail });

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found. Please register first.' });
    }

    if (clinic.emailVerified) {
      return res.status(400).json({ message: 'Email is already verified. Your application is under review.' });
    }

    const otp = generateOtp(6);
    clinic.verificationOtpHash = hashOtp(otp);
    clinic.verificationOtpExpiresAt = getOtpExpiryDate(10);
    await clinic.save();

    await sendVerificationOtpEmail({
      to: clinic.email,
      firstName: clinic.name,
      otp
    });

    return res.status(200).json({ message: 'Clinic verification code sent successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not send clinic verification code', error: error.message });
  }
};

export const sendClinicLoginOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const clinic = await Clinic.findOne({ email: normalizedEmail });

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    if (!clinic.emailVerified) {
      return res.status(403).json({ message: 'Please verify your email before signing in' });
    }

    if (clinic.applicationStatus === 'pending') {
      return res.status(403).json({ message: 'Application not approved yet' });
    }

    if (clinic.applicationStatus === 'declined') {
      return res.status(403).json({ message: 'Application declined by admin' });
    }

    const otp = generateOtp(6);
    clinic.loginOtpHash = hashOtp(otp);
    clinic.loginOtpExpiresAt = getOtpExpiryDate(10);
    await clinic.save();

    await sendVerificationOtpEmail({
      to: clinic.email,
      firstName: clinic.name,
      otp
    });

    return res.status(200).json({ message: 'Login OTP sent successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not send login OTP', error: error.message });
  }
};

export const verifyClinicOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const clinic = await Clinic.findOne({ email: normalizedEmail });

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found. Please register first.' });
    }

    if (clinic.emailVerified) {
      return res.status(200).json({ message: 'Email already verified. Application is under review.' });
    }

    if (!clinic.verificationOtpHash || !clinic.verificationOtpExpiresAt) {
      return res.status(400).json({ message: 'No OTP found. Please request a new code.' });
    }

    if (clinic.verificationOtpExpiresAt.getTime() < Date.now()) {
      clinic.verificationOtpHash = null;
      clinic.verificationOtpExpiresAt = null;
      await clinic.save();

      return res.status(400).json({ message: 'Verification code has expired. Request a new code.' });
    }

    const incomingOtpHash = hashOtp(otp);

    if (incomingOtpHash !== clinic.verificationOtpHash) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    clinic.emailVerified = true;
    clinic.verificationOtpHash = null;
    clinic.verificationOtpExpiresAt = null;
    await clinic.save();

    return res.status(200).json({ message: 'Email verified. Your application is now under admin review.' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not verify clinic OTP', error: error.message });
  }
};

export const loginClinic = async (req, res) => {
  try {
    const { email, password, otp } = req.body;

    if (!email || !password || !otp) {
      return res.status(400).json({ message: 'Email, password, and OTP are required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const clinic = await Clinic.findOne({ email: normalizedEmail });

    if (!clinic) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await clinic.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!clinic.emailVerified) {
      return res.status(403).json({ message: 'Please verify your email before signing in' });
    }

    if (clinic.applicationStatus === 'pending') {
      return res.status(403).json({ message: 'Application not approved yet' });
    }

    if (clinic.applicationStatus === 'declined') {
      return res.status(403).json({ message: 'Application declined by admin' });
    }

    if (!clinic.loginOtpHash || !clinic.loginOtpExpiresAt) {
      return res.status(400).json({ message: 'Please request login OTP first' });
    }

    if (clinic.loginOtpExpiresAt.getTime() < Date.now()) {
      clinic.loginOtpHash = null;
      clinic.loginOtpExpiresAt = null;
      await clinic.save();
      return res.status(400).json({ message: 'Login OTP expired. Please request a new OTP.' });
    }

    const incomingOtpHash = hashOtp(otp);

    if (incomingOtpHash !== clinic.loginOtpHash) {
      return res.status(400).json({ message: 'Invalid login OTP' });
    }

    clinic.loginOtpHash = null;
    clinic.loginOtpExpiresAt = null;
    await clinic.save();

    const token = generateAuthToken(
      { id: clinic._id, email: clinic.email, role: clinic.role },
      '24h'
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
      clinic: {
        id: clinic._id,
        name: clinic.name,
        email: clinic.email,
        role: clinic.role,
        applicationStatus: clinic.applicationStatus,
        avatarUrl: getClinicAvatarUrl(clinic)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getClinicProfile = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.user?.id).select('-password -verificationOtpHash -verificationOtpExpiresAt -loginOtpHash -loginOtpExpiresAt');

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    return res.status(200).json({
      clinic: {
        id: clinic._id,
        name: clinic.name,
        email: clinic.email,
        phone: clinic.phone,
        facilityType: clinic.facilityType,
        address: clinic.address,
        applicationStatus: clinic.applicationStatus,
        role: clinic.role,
        avatarUrl: getClinicAvatarUrl(clinic),
        permitDocument: clinic.permitDocument || null,
        createdAt: clinic.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch clinic profile', error: error.message });
  }
};

export const updateClinicProfile = async (req, res) => {
  try {
    const { name, phone, address, facilityType } = req.body;

    const clinic = await Clinic.findById(req.user?.id);

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    if (name) clinic.name = String(name).trim();
    if (phone) clinic.phone = String(phone).trim();
    if (address) clinic.address = String(address).trim();
    if (facilityType) clinic.facilityType = String(facilityType).trim();

    await clinic.save();

    return res.status(200).json({
      message: 'Profile updated successfully',
      clinic: {
        id: clinic._id,
        name: clinic.name,
        email: clinic.email,
        phone: clinic.phone,
        facilityType: clinic.facilityType,
        address: clinic.address,
        applicationStatus: clinic.applicationStatus,
        role: clinic.role,
        avatarUrl: getClinicAvatarUrl(clinic)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update clinic profile', error: error.message });
  }
};

export const updateClinicAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Avatar image file is required' });
    }

    const clinic = await Clinic.findById(req.user?.id);

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    if (clinic.avatarDocument?.publicId) {
      await deleteFromCloudinary(
        clinic.avatarDocument.publicId,
        clinic.avatarDocument.resourceType || 'image'
      );
    }

    const uploadedAvatar = await uploadUserAvatarToCloudinary(req.file, 'clinics');
    clinic.avatarDocument = uploadedAvatar;
    await clinic.save();

    return res.status(200).json({
      message: 'Avatar updated successfully',
      clinic: {
        id: clinic._id,
        name: clinic.name,
        email: clinic.email,
        role: clinic.role,
        applicationStatus: clinic.applicationStatus,
        avatarUrl: getClinicAvatarUrl(clinic)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update avatar', error: error.message });
  }
};
