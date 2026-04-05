import express from 'express';
import {
  loginDoctor,
  registerDoctor,
  sendDoctorLoginOtp,
  sendDoctorVerificationOtp,
  verifyDoctorOtp
} from '../controllers/auth/doctorAuthController.js';
import { handleDoctorLicenseUpload } from '../middlewares/uploadDoctorLicense.js';

const router = express.Router();

router.post('/register', handleDoctorLicenseUpload, registerDoctor);
router.post('/send-otp', sendDoctorVerificationOtp);
router.post('/send-login-otp', sendDoctorLoginOtp);
router.post('/verify-otp', verifyDoctorOtp);
router.post('/login', loginDoctor);

export default router;
