import express from 'express';
import {
  loginClinic,
  registerClinic,
  sendClinicLoginOtp,
  sendClinicVerificationOtp,
  updateClinicAvatar,
  verifyClinicOtp
} from '../controllers/auth/clinicAuthController.js';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { handleAvatarUpload } from '../middlewares/uploadAvatar.js';
import { handleClinicPermitUpload } from '../middlewares/uploadClinicPermit.js';

const router = express.Router();

router.post('/register', handleClinicPermitUpload, registerClinic);
router.post('/send-otp', sendClinicVerificationOtp);
router.post('/send-login-otp', sendClinicLoginOtp);
router.post('/verify-otp', verifyClinicOtp);
router.post('/login', loginClinic);
router.patch('/avatar', requireRoleAuth(['clinic']), handleAvatarUpload, updateClinicAvatar);

export default router;
