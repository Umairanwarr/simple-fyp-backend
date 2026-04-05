import express from 'express';
import {
  loginPatientWithGoogle,
  loginPatient,
  resetPatientPassword,
  registerPatient,
  sendPatientVerificationOtp,
  verifyPatientOtp
} from '../controllers/auth/patientAuthController.js';

const router = express.Router();

router.post('/register', registerPatient);
router.post('/send-otp', sendPatientVerificationOtp);
router.post('/verify-otp', verifyPatientOtp);
router.post('/reset-password', resetPatientPassword);
router.post('/login', loginPatient);
router.post('/google-login', loginPatientWithGoogle);

export default router;
