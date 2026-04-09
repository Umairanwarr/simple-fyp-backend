import {
  Doctor,
  deleteFromCloudinary,
  generateAuthToken,
  generateOtp,
  getOtpExpiryDate,
  hashOtp,
  mapDoctorProfilePayload,
  mapDoctorSessionPayload,
  normalizeEmail,
  sendVerificationOtpEmail,
  uploadDoctorLicenseToCloudinary
} from './shared.js';

export const registerDoctor = async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      specialization,
      licenseNumber,
      experience,
      address,
      password,
      confirmPassword
    } = req.body;

    if (
      !fullName ||
      !email ||
      !phone ||
      !specialization ||
      !licenseNumber ||
      !experience ||
      !address ||
      !password ||
      !confirmPassword
    ) {
      return res.status(400).json({ message: 'All doctor registration fields are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const normalizedEmail = normalizeEmail(email);
    const existingDoctor = await Doctor.findOne({ email: normalizedEmail });

    if (existingDoctor?.applicationStatus === 'approved') {
      return res.status(409).json({ message: 'This doctor account is already approved. Please sign in.' });
    }

    if (existingDoctor?.applicationStatus === 'pending' && existingDoctor?.emailVerified) {
      return res.status(409).json({ message: 'Your application is already submitted and under review.' });
    }

    let uploadedLicense = null;

    if (req.file) {
      uploadedLicense = await uploadDoctorLicenseToCloudinary(req.file);
    }

    if (!uploadedLicense && !existingDoctor?.licenseDocument?.url) {
      return res.status(400).json({ message: 'Medical license file is required' });
    }

    if (existingDoctor?.licenseDocument?.publicId && uploadedLicense) {
      await deleteFromCloudinary(
        existingDoctor.licenseDocument.publicId,
        existingDoctor.licenseDocument.resourceType
      );
    }

    const doctor = existingDoctor || new Doctor();

    doctor.fullName = String(fullName).trim();
    doctor.email = normalizedEmail;
    doctor.phone = String(phone).trim();
    doctor.specialization = String(specialization).trim();
    doctor.licenseNumber = String(licenseNumber).trim();
    doctor.experience = Number(experience);
    doctor.address = String(address).trim();
    doctor.bio = String(existingDoctor?.bio || '').trim();
    doctor.password = password;
    doctor.emailVerified = false;
    doctor.applicationStatus = 'pending';
    doctor.adminReviewNote = '';
    doctor.reviewedAt = null;
    doctor.reviewedBy = null;
    doctor.verificationOtpHash = null;
    doctor.verificationOtpExpiresAt = null;

    if (uploadedLicense) {
      doctor.licenseDocument = uploadedLicense;
    }

    await doctor.save();

    return res.status(201).json({
      message: 'Doctor details submitted. Please verify your email with OTP.',
      email: doctor.email
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not register doctor', error: error.message });
  }
};

export const sendDoctorVerificationOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const doctor = await Doctor.findOne({ email: normalizedEmail });

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found. Please register first.' });
    }

    if (doctor.emailVerified) {
      return res.status(400).json({ message: 'Email is already verified. Your application is under review.' });
    }

    const otp = generateOtp(6);
    doctor.verificationOtpHash = hashOtp(otp);
    doctor.verificationOtpExpiresAt = getOtpExpiryDate(10);
    await doctor.save();

    await sendVerificationOtpEmail({
      to: doctor.email,
      firstName: doctor.fullName,
      otp
    });

    return res.status(200).json({ message: 'Doctor verification code sent successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not send doctor verification code', error: error.message });
  }
};

export const sendDoctorLoginOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const doctor = await Doctor.findOne({ email: normalizedEmail });

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    if (!doctor.emailVerified) {
      return res.status(403).json({ message: 'Please verify your email before signing in' });
    }

    if (doctor.applicationStatus === 'pending') {
      return res.status(403).json({ message: 'Application not approved yet' });
    }

    if (doctor.applicationStatus === 'declined') {
      return res.status(403).json({ message: 'Application declined by admin' });
    }

    const otp = generateOtp(6);
    doctor.loginOtpHash = hashOtp(otp);
    doctor.loginOtpExpiresAt = getOtpExpiryDate(10);
    await doctor.save();

    await sendVerificationOtpEmail({
      to: doctor.email,
      firstName: doctor.fullName,
      otp
    });

    return res.status(200).json({ message: 'Login OTP sent successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not send login OTP', error: error.message });
  }
};

export const verifyDoctorOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const doctor = await Doctor.findOne({ email: normalizedEmail });

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found. Please register first.' });
    }

    if (doctor.emailVerified) {
      return res.status(200).json({ message: 'Email already verified. Application is under review.' });
    }

    if (!doctor.verificationOtpHash || !doctor.verificationOtpExpiresAt) {
      return res.status(400).json({ message: 'No OTP found. Please request a new code.' });
    }

    if (doctor.verificationOtpExpiresAt.getTime() < Date.now()) {
      doctor.verificationOtpHash = null;
      doctor.verificationOtpExpiresAt = null;
      await doctor.save();

      return res.status(400).json({ message: 'Verification code has expired. Request a new code.' });
    }

    const incomingOtpHash = hashOtp(otp);

    if (incomingOtpHash !== doctor.verificationOtpHash) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    doctor.emailVerified = true;
    doctor.verificationOtpHash = null;
    doctor.verificationOtpExpiresAt = null;
    await doctor.save();

    return res.status(200).json({ message: 'Email verified. Your application is now under admin review.' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not verify doctor OTP', error: error.message });
  }
};

export const loginDoctor = async (req, res) => {
  try {
    const { email, password, otp } = req.body;

    if (!email || !password || !otp) {
      return res.status(400).json({ message: 'Email, password, and OTP are required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const doctor = await Doctor.findOne({ email: normalizedEmail });

    if (!doctor) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await doctor.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!doctor.emailVerified) {
      return res.status(403).json({ message: 'Please verify your email before signing in' });
    }

    if (doctor.applicationStatus === 'pending') {
      return res.status(403).json({ message: 'Application not approved yet' });
    }

    if (doctor.applicationStatus === 'declined') {
      return res.status(403).json({ message: 'Application declined by admin' });
    }

    if (!doctor.loginOtpHash || !doctor.loginOtpExpiresAt) {
      return res.status(400).json({ message: 'Please request login OTP first' });
    }

    if (doctor.loginOtpExpiresAt.getTime() < Date.now()) {
      doctor.loginOtpHash = null;
      doctor.loginOtpExpiresAt = null;
      await doctor.save();
      return res.status(400).json({ message: 'Login OTP expired. Please request a new OTP.' });
    }

    const incomingOtpHash = hashOtp(otp);

    if (incomingOtpHash !== doctor.loginOtpHash) {
      return res.status(400).json({ message: 'Invalid login OTP' });
    }

    doctor.loginOtpHash = null;
    doctor.loginOtpExpiresAt = null;
    await doctor.save();

    const token = generateAuthToken(
      { id: doctor._id, email: doctor.email, role: doctor.role },
      '24h'
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
      doctor: mapDoctorSessionPayload(doctor),
      profile: mapDoctorProfilePayload(doctor)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
