import {
  Patient,
  crypto,
  deleteFromCloudinary,
  generateAuthToken,
  generateOtp,
  getOtpExpiryDate,
  getPatientAvatarUrl,
  hashOtp,
  normalizeEmail,
  parseNames,
  sendVerificationOtpEmail,
  uploadUserAvatarToCloudinary,
  verifyFirebaseIdToken
} from './shared.js';

export const registerPatient = async (req, res) => {
  try {
    const {
      email,
      firstName,
      lastName,
      dob,
      gender = 'male',
      password,
      confirmPassword
    } = req.body;

    if (!email || !firstName || !lastName || !dob || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const normalizedEmail = normalizeEmail(email);
    const existingPatient = await Patient.findOne({ email: normalizedEmail });

    if (existingPatient?.isVerified) {
      return res.status(409).json({ message: 'Email is already registered. Please sign in.' });
    }

    const payload = {
      email: normalizedEmail,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      dob: new Date(dob),
      gender,
      password,
      isVerified: false,
      verificationOtpHash: null,
      verificationOtpExpiresAt: null
    };

    let patient;

    if (existingPatient) {
      existingPatient.email = payload.email;
      existingPatient.firstName = payload.firstName;
      existingPatient.lastName = payload.lastName;
      existingPatient.dob = payload.dob;
      existingPatient.gender = payload.gender;
      existingPatient.password = payload.password;
      existingPatient.isVerified = false;
      existingPatient.verificationOtpHash = null;
      existingPatient.verificationOtpExpiresAt = null;

      patient = await existingPatient.save();
    } else {
      patient = await Patient.create(payload);
    }

    return res.status(201).json({
      message: 'Registration successful. Continue to verify your email.',
      email: patient.email
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const sendPatientVerificationOtp = async (req, res) => {
  try {
    const { email, purpose = 'signup' } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    if (!['signup', 'reset'].includes(purpose)) {
      return res.status(400).json({ message: 'Invalid OTP purpose' });
    }

    const normalizedEmail = normalizeEmail(email);
    const patient = await Patient.findOne({ email: normalizedEmail });

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found. Please sign up first.' });
    }

    if (purpose === 'signup' && patient.isVerified) {
      return res.status(400).json({ message: 'Account is already verified. Please sign in.' });
    }

    if (purpose === 'reset' && !patient.isVerified) {
      return res.status(400).json({ message: 'Please verify your account first before resetting password.' });
    }

    const otp = generateOtp(6);
    patient.verificationOtpHash = hashOtp(otp);
    patient.verificationOtpExpiresAt = getOtpExpiryDate(10);
    await patient.save();

    await sendVerificationOtpEmail({
      to: patient.email,
      firstName: patient.firstName,
      otp
    });

    return res.status(200).json({ message: 'Verification code sent successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not send verification code', error: error.message });
  }
};

export const verifyPatientOtp = async (req, res) => {
  try {
    const { email, otp, purpose = 'signup' } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    if (!['signup', 'reset'].includes(purpose)) {
      return res.status(400).json({ message: 'Invalid OTP purpose' });
    }

    const normalizedEmail = normalizeEmail(email);
    const patient = await Patient.findOne({ email: normalizedEmail });

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found. Please sign up first.' });
    }

    if (purpose === 'signup' && patient.isVerified) {
      return res.status(200).json({ message: 'Account already verified. Please sign in.' });
    }

    if (purpose === 'reset' && !patient.isVerified) {
      return res.status(400).json({ message: 'Account is not verified yet' });
    }

    if (!patient.verificationOtpHash || !patient.verificationOtpExpiresAt) {
      return res.status(400).json({ message: 'No OTP found. Please request a new verification code.' });
    }

    if (patient.verificationOtpExpiresAt.getTime() < Date.now()) {
      patient.verificationOtpHash = null;
      patient.verificationOtpExpiresAt = null;
      await patient.save();

      return res.status(400).json({ message: 'Verification code has expired. Request a new code.' });
    }

    const incomingOtpHash = hashOtp(otp);

    if (incomingOtpHash !== patient.verificationOtpHash) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    if (purpose === 'signup') {
      patient.isVerified = true;
    }

    patient.verificationOtpHash = null;
    patient.verificationOtpExpiresAt = null;
    let resetToken;

    if (purpose === 'reset') {
      resetToken = crypto.randomBytes(32).toString('hex');
      patient.resetPasswordTokenHash = hashOtp(resetToken);
      patient.resetPasswordTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    }

    await patient.save();

    if (purpose === 'signup') {
      return res.status(200).json({ message: 'Email verified successfully. Please sign in.' });
    }

    return res.status(200).json({
      message: 'OTP verified. You can now reset your password.',
      resetToken
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not verify OTP', error: error.message });
  }
};

export const resetPatientPassword = async (req, res) => {
  try {
    const { email, resetToken, password, confirmPassword } = req.body;

    if (!email || !resetToken || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Email, reset token, and passwords are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const normalizedEmail = normalizeEmail(email);
    const patient = await Patient.findOne({ email: normalizedEmail });

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    if (!patient.resetPasswordTokenHash || !patient.resetPasswordTokenExpiresAt) {
      return res.status(400).json({ message: 'Reset session has expired. Please request a new code.' });
    }

    if (patient.resetPasswordTokenExpiresAt.getTime() < Date.now()) {
      patient.resetPasswordTokenHash = null;
      patient.resetPasswordTokenExpiresAt = null;
      await patient.save();
      return res.status(400).json({ message: 'Reset session has expired. Please request a new code.' });
    }

    const incomingTokenHash = hashOtp(resetToken);

    if (incomingTokenHash !== patient.resetPasswordTokenHash) {
      return res.status(400).json({ message: 'Invalid reset session. Please verify OTP again.' });
    }

    patient.password = password;
    patient.resetPasswordTokenHash = null;
    patient.resetPasswordTokenExpiresAt = null;
    await patient.save();

    return res.status(200).json({ message: 'Password reset successfully. Please sign in.' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not reset password', error: error.message });
  }
};

export const loginPatient = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const patient = await Patient.findOne({ email: normalizedEmail });

    if (!patient) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await patient.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!patient.isVerified) {
      return res.status(403).json({ message: 'Please verify your email before signing in' });
    }

    const token = generateAuthToken(
      { id: patient._id, email: patient.email, role: patient.role },
      '24h'
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
      patient: {
        id: patient._id,
        email: patient.email,
        firstName: patient.firstName,
        lastName: patient.lastName,
        role: patient.role,
        avatarUrl: getPatientAvatarUrl(patient)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const updatePatientAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Avatar image file is required' });
    }

    const patient = await Patient.findById(req.user?.id);

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    if (patient.avatarDocument?.publicId) {
      await deleteFromCloudinary(
        patient.avatarDocument.publicId,
        patient.avatarDocument.resourceType || 'image'
      );
    }

    const uploadedAvatar = await uploadUserAvatarToCloudinary(req.file, 'patients');
    patient.avatarDocument = uploadedAvatar;
    await patient.save();

    return res.status(200).json({
      message: 'Avatar updated successfully',
      patient: {
        id: patient._id,
        email: patient.email,
        firstName: patient.firstName,
        lastName: patient.lastName,
        role: patient.role,
        avatarUrl: getPatientAvatarUrl(patient)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update avatar', error: error.message });
  }
};

export const loginPatientWithGoogle = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'Google ID token is required' });
    }

    const firebaseUser = await verifyFirebaseIdToken(idToken);
    const normalizedEmail = normalizeEmail(firebaseUser.email);

    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Google account email is missing' });
    }

    const { firstName, lastName } = parseNames(firebaseUser.displayName, normalizedEmail);
    let patient = await Patient.findOne({ email: normalizedEmail });

    if (!patient) {
      // Random password keeps schema compatibility for Google-created patients.
      const placeholderPassword = `${crypto.randomBytes(18).toString('hex')}A!`;

      patient = await Patient.create({
        email: normalizedEmail,
        firstName,
        lastName,
        dob: new Date('1990-01-01'),
        gender: 'other',
        password: placeholderPassword,
        isVerified: true
      });
    } else {
      patient.isVerified = true;

      if (!patient.firstName) {
        patient.firstName = firstName;
      }

      if (!patient.lastName) {
        patient.lastName = lastName;
      }

      if (!getPatientAvatarUrl(patient) && firebaseUser.photoUrl) {
        patient.avatarDocument = {
          url: String(firebaseUser.photoUrl).trim(),
          publicId: null,
          resourceType: null,
          format: null,
          originalName: null,
          bytes: null
        };
      }

      await patient.save();
    }

    if (!getPatientAvatarUrl(patient) && firebaseUser.photoUrl) {
      patient.avatarDocument = {
        url: String(firebaseUser.photoUrl).trim(),
        publicId: null,
        resourceType: null,
        format: null,
        originalName: null,
        bytes: null
      };

      await patient.save();
    }

    const token = generateAuthToken(
      { id: patient._id, email: patient.email, role: patient.role },
      '24h'
    );

    return res.status(200).json({
      message: 'Google login successful',
      token,
      patient: {
        id: patient._id,
        email: patient.email,
        firstName: patient.firstName,
        lastName: patient.lastName,
        role: patient.role,
        avatarUrl: getPatientAvatarUrl(patient)
      }
    });
  } catch (error) {
    if (/not configured/i.test(String(error?.message || ''))) {
      return res.status(500).json({ message: 'Google login is not configured on server' });
    }

    return res.status(401).json({ message: error.message || 'Could not authenticate with Google' });
  }
};
