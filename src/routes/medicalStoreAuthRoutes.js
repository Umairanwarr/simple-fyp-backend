import express from 'express';
import {
  loginMedicalStore,
  registerMedicalStore,
  sendMedicalStoreLoginOtp,
  sendMedicalStoreVerificationOtp,
  verifyMedicalStoreOtp
} from '../controllers/auth/medicalStoreAuthController.js';
import { handleMedicalStoreLicenseUpload } from '../middlewares/uploadMedicalStoreLicense.js';

const router = express.Router();

router.post('/register', handleMedicalStoreLicenseUpload, registerMedicalStore);
router.post('/send-otp', sendMedicalStoreVerificationOtp);
router.post('/send-login-otp', sendMedicalStoreLoginOtp);
router.post('/verify-otp', verifyMedicalStoreOtp);
router.post('/login', loginMedicalStore);

export default router;
