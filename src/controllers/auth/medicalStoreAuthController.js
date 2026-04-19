import { MedicalStore } from '../../models/MedicalStore.js';
import {
  deleteFromCloudinary,
  uploadMedicalStoreLicenseToCloudinary,
  uploadUserAvatarToCloudinary
} from '../../services/cloudinaryService.js';
import { sendVerificationOtpEmail } from '../../services/mailService.js';
import { generateOtp, getOtpExpiryDate, hashOtp } from '../../utils/otp.js';
import { generateAuthToken } from '../../utils/token.js';

const normalizeEmail = (email) => String(email || '').toLowerCase().trim();

const getMedicalStoreAvatarUrl = (medicalStoreRecord) => {
  return String(medicalStoreRecord?.avatarDocument?.url || '').trim();
};

export const registerMedicalStore = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      licenseNumber,
      address,
      operatingHours,
      password,
      confirmPassword
    } = req.body;

    if (!name || !email || !phone || !licenseNumber || !address || !operatingHours || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All medical store registration fields are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const normalizedEmail = normalizeEmail(email);
    const existingStore = await MedicalStore.findOne({ email: normalizedEmail });

    if (existingStore?.applicationStatus === 'approved') {
      return res.status(409).json({ message: 'This medical store account is already approved. Please sign in.' });
    }

    if (existingStore?.applicationStatus === 'pending' && existingStore?.emailVerified) {
      return res.status(409).json({ message: 'Your medical store application is already submitted and under review.' });
    }

    let uploadedLicense = null;

    if (req.file) {
      uploadedLicense = await uploadMedicalStoreLicenseToCloudinary(req.file);
    }

    if (!uploadedLicense && !existingStore?.licenseDocument?.url) {
      return res.status(400).json({ message: 'Pharmacy license file is required' });
    }

    if (existingStore?.licenseDocument?.publicId && uploadedLicense) {
      await deleteFromCloudinary(
        existingStore.licenseDocument.publicId,
        existingStore.licenseDocument.resourceType
      );
    }

    const medicalStore = existingStore || new MedicalStore();

    medicalStore.name = String(name).trim();
    medicalStore.email = normalizedEmail;
    medicalStore.phone = String(phone).trim();
    medicalStore.licenseNumber = String(licenseNumber).trim();
    medicalStore.address = String(address).trim();
    medicalStore.operatingHours = String(operatingHours).trim();
    medicalStore.password = password;
    medicalStore.emailVerified = false;
    medicalStore.applicationStatus = 'pending';
    medicalStore.adminReviewNote = '';
    medicalStore.reviewedAt = null;
    medicalStore.reviewedBy = null;
    medicalStore.verificationOtpHash = null;
    medicalStore.verificationOtpExpiresAt = null;

    if (uploadedLicense) {
      medicalStore.licenseDocument = uploadedLicense;
    }

    await medicalStore.save();

    return res.status(201).json({
      message: 'Medical store details submitted. Please verify your email with OTP.',
      email: medicalStore.email
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not register medical store', error: error.message });
  }
};

export const sendMedicalStoreVerificationOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const medicalStore = await MedicalStore.findOne({ email: normalizedEmail });

    if (!medicalStore) {
      return res.status(404).json({ message: 'Medical store not found. Please register first.' });
    }

    if (medicalStore.emailVerified) {
      return res.status(400).json({ message: 'Email is already verified. Your application is under review.' });
    }

    const otp = generateOtp(6);
    medicalStore.verificationOtpHash = hashOtp(otp);
    medicalStore.verificationOtpExpiresAt = getOtpExpiryDate(10);
    await medicalStore.save();

    await sendVerificationOtpEmail({
      to: medicalStore.email,
      firstName: medicalStore.name,
      otp
    });

    return res.status(200).json({ message: 'Medical store verification code sent successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not send medical store verification code', error: error.message });
  }
};

export const sendMedicalStoreLoginOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const medicalStore = await MedicalStore.findOne({ email: normalizedEmail });

    if (!medicalStore) {
      return res.status(404).json({ message: 'Medical store not found' });
    }

    if (!medicalStore.emailVerified) {
      return res.status(403).json({ message: 'Please verify your email before signing in' });
    }

    if (medicalStore.applicationStatus === 'pending') {
      return res.status(403).json({ message: 'Application not approved yet' });
    }

    if (medicalStore.applicationStatus === 'declined') {
      return res.status(403).json({ message: 'Application declined by admin' });
    }

    const otp = generateOtp(6);
    medicalStore.loginOtpHash = hashOtp(otp);
    medicalStore.loginOtpExpiresAt = getOtpExpiryDate(10);
    await medicalStore.save();

    await sendVerificationOtpEmail({
      to: medicalStore.email,
      firstName: medicalStore.name,
      otp
    });

    return res.status(200).json({ message: 'Login OTP sent successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not send login OTP', error: error.message });
  }
};

export const verifyMedicalStoreOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const medicalStore = await MedicalStore.findOne({ email: normalizedEmail });

    if (!medicalStore) {
      return res.status(404).json({ message: 'Medical store not found. Please register first.' });
    }

    if (medicalStore.emailVerified) {
      return res.status(200).json({ message: 'Email already verified. Application is under review.' });
    }

    if (!medicalStore.verificationOtpHash || !medicalStore.verificationOtpExpiresAt) {
      return res.status(400).json({ message: 'No OTP found. Please request a new code.' });
    }

    if (medicalStore.verificationOtpExpiresAt.getTime() < Date.now()) {
      medicalStore.verificationOtpHash = null;
      medicalStore.verificationOtpExpiresAt = null;
      await medicalStore.save();

      return res.status(400).json({ message: 'Verification code has expired. Request a new code.' });
    }

    const incomingOtpHash = hashOtp(otp);

    if (incomingOtpHash !== medicalStore.verificationOtpHash) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    medicalStore.emailVerified = true;
    medicalStore.verificationOtpHash = null;
    medicalStore.verificationOtpExpiresAt = null;
    await medicalStore.save();

    return res.status(200).json({ message: 'Email verified. Your application is now under admin review.' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not verify medical store OTP', error: error.message });
  }
};

export const loginMedicalStore = async (req, res) => {
  try {
    const { email, password, otp } = req.body;

    if (!email || !password || !otp) {
      return res.status(400).json({ message: 'Email, password, and OTP are required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const medicalStore = await MedicalStore.findOne({ email: normalizedEmail });

    if (!medicalStore) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await medicalStore.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!medicalStore.emailVerified) {
      return res.status(403).json({ message: 'Please verify your email before signing in' });
    }

    if (medicalStore.applicationStatus === 'pending') {
      return res.status(403).json({ message: 'Application not approved yet' });
    }

    if (medicalStore.applicationStatus === 'declined') {
      return res.status(403).json({ message: 'Application declined by admin' });
    }

    if (!medicalStore.loginOtpHash || !medicalStore.loginOtpExpiresAt) {
      return res.status(400).json({ message: 'Please request login OTP first' });
    }

    if (medicalStore.loginOtpExpiresAt.getTime() < Date.now()) {
      medicalStore.loginOtpHash = null;
      medicalStore.loginOtpExpiresAt = null;
      await medicalStore.save();
      return res.status(400).json({ message: 'Login OTP expired. Please request a new OTP.' });
    }

    const incomingOtpHash = hashOtp(otp);

    if (incomingOtpHash !== medicalStore.loginOtpHash) {
      return res.status(400).json({ message: 'Invalid login OTP' });
    }

    medicalStore.loginOtpHash = null;
    medicalStore.loginOtpExpiresAt = null;
    await medicalStore.save();

    const token = generateAuthToken(
      { id: medicalStore._id, email: medicalStore.email, role: medicalStore.role },
      '24h'
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
      medicalStore: {
        id: medicalStore._id,
        name: medicalStore.name,
        email: medicalStore.email,
        role: medicalStore.role,
        applicationStatus: medicalStore.applicationStatus,
        avatarUrl: getMedicalStoreAvatarUrl(medicalStore)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const updateMedicalStoreAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Avatar image file is required' });
    }

    const medicalStore = await MedicalStore.findById(req.user?.id);

    if (!medicalStore) {
      return res.status(404).json({ message: 'Medical store not found' });
    }

    if (medicalStore.avatarDocument?.publicId) {
      await deleteFromCloudinary(
        medicalStore.avatarDocument.publicId,
        medicalStore.avatarDocument.resourceType || 'image'
      );
    }

    const uploadedAvatar = await uploadUserAvatarToCloudinary(req.file, 'medical-stores');
    medicalStore.avatarDocument = uploadedAvatar;
    await medicalStore.save();

    return res.status(200).json({
      message: 'Avatar updated successfully',
      medicalStore: {
        id: medicalStore._id,
        name: medicalStore.name,
        email: medicalStore.email,
        role: medicalStore.role,
        applicationStatus: medicalStore.applicationStatus,
        avatarUrl: getMedicalStoreAvatarUrl(medicalStore)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update avatar', error: error.message });
  }
};
import { 
  mapMedicalStoreSessionPayload 
} from './medical-store/shared.js';

export const getMedicalStoreProfile = async (req, res) => {
  try {
    const medicalStore = await MedicalStore.findById(req.user?.id);
    if (!medicalStore) return res.status(404).json({ message: 'Medical store not found' });

    return res.status(200).json({
      medicalStore: mapMedicalStoreSessionPayload(medicalStore)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch profile', error: error.message });
  }
};

export const updateMedicalStoreProfile = async (req, res) => {
  try {
    const { name, phone, address, operatingHours, bio } = req.body;
    const medicalStore = await MedicalStore.findById(req.user?.id);
    
    if (!medicalStore) return res.status(404).json({ message: 'Medical store not found' });

    if (name) medicalStore.name = String(name).trim();
    if (phone) medicalStore.phone = String(phone).trim();
    if (address) medicalStore.address = String(address).trim();
    if (operatingHours) medicalStore.operatingHours = String(operatingHours).trim();
    if (typeof bio === 'string') medicalStore.bio = bio.trim();

    await medicalStore.save();

    return res.status(200).json({
      message: 'Profile updated successfully',
      medicalStore: mapMedicalStoreSessionPayload(medicalStore)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update profile', error: error.message });
  }
};
