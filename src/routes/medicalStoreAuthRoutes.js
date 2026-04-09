import express from 'express';
import {
  loginMedicalStore,
  registerMedicalStore,
  sendMedicalStoreLoginOtp,
  sendMedicalStoreVerificationOtp,
  updateMedicalStoreAvatar,
  verifyMedicalStoreOtp
} from '../controllers/auth/medicalStoreAuthController.js';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { handleAvatarUpload } from '../middlewares/uploadAvatar.js';
import { handleMedicalStoreLicenseUpload } from '../middlewares/uploadMedicalStoreLicense.js';

const router = express.Router();

router.post('/register', handleMedicalStoreLicenseUpload, registerMedicalStore);
router.post('/send-otp', sendMedicalStoreVerificationOtp);
router.post('/send-login-otp', sendMedicalStoreLoginOtp);
router.post('/verify-otp', verifyMedicalStoreOtp);
router.post('/login', loginMedicalStore);
router.patch('/avatar', requireRoleAuth(['medical-store']), handleAvatarUpload, updateMedicalStoreAvatar);

export default router;
