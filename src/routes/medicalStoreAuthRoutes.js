import express from 'express';
import { 
  getMedicalStoreNotifications, 
  markMedicalStoreNotificationsAsRead 
} from '../controllers/auth/medical-store/notificationsController.js';
import { 
  getMedicalStoreProfile, 
  loginMedicalStore,
  registerMedicalStore,
  sendMedicalStoreLoginOtp,
  sendMedicalStoreVerificationOtp,
  updateMedicalStoreAvatar,
  updateMedicalStoreProfile,
  verifyMedicalStoreOtp
} from '../controllers/auth/medicalStoreAuthController.js';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { handleAvatarUpload } from '../middlewares/uploadAvatar.js';
import { handleMedicalStoreLicenseUpload } from '../middlewares/uploadMedicalStoreLicense.js';

import {
  cancelStoreSubscription,
  confirmStoreSubscriptionCheckoutSession,
  createStoreSubscriptionCheckoutSession,
  getStoreSubscriptionPricing,
  getStoreSubscriptionStatus
} from '../controllers/auth/medical-store/subscriptionController.js';

import {
  saveStoreBankAccount,
  getStoreBankAccount,
  createStoreWithdrawRequest,
  getStoreWithdrawRequests
} from '../controllers/auth/medical-store/withdrawController.js';

const router = express.Router();

router.post('/register', handleMedicalStoreLicenseUpload, registerMedicalStore);
router.post('/send-otp', sendMedicalStoreVerificationOtp);
router.post('/send-login-otp', sendMedicalStoreLoginOtp);
router.post('/verify-otp', verifyMedicalStoreOtp);
router.post('/login', loginMedicalStore);
router.get('/profile', requireRoleAuth(['medical-store']), getMedicalStoreProfile);
router.patch('/profile', requireRoleAuth(['medical-store']), updateMedicalStoreProfile);
router.patch('/avatar', requireRoleAuth(['medical-store']), handleAvatarUpload, updateMedicalStoreAvatar);

router.get('/notifications', requireRoleAuth(['medical-store']), getMedicalStoreNotifications);
router.patch('/notifications/read', requireRoleAuth(['medical-store']), markMedicalStoreNotificationsAsRead);

// ─── Subscription Routes ───
router.get('/subscription-pricing', getStoreSubscriptionPricing);
router.get('/subscription-status', requireRoleAuth(['medical-store']), getStoreSubscriptionStatus);
router.post('/create-subscription-checkout', requireRoleAuth(['medical-store']), createStoreSubscriptionCheckoutSession);
router.post('/confirm-subscription-checkout', requireRoleAuth(['medical-store']), confirmStoreSubscriptionCheckoutSession);
router.post('/cancel-subscription', requireRoleAuth(['medical-store']), cancelStoreSubscription);

import { getStoreReviews } from '../controllers/auth/medical-store/reviewsController.js';

// ─── Withdrawal & Bank Account Routes ───
router.get('/bank-account', requireRoleAuth(['medical-store']), getStoreBankAccount);
router.put('/bank-account', requireRoleAuth(['medical-store']), saveStoreBankAccount);
router.get('/withdraw-requests', requireRoleAuth(['medical-store']), getStoreWithdrawRequests);
router.post('/withdraw-requests', requireRoleAuth(['medical-store']), createStoreWithdrawRequest);

// ─── Reviews Route ───
router.get('/reviews', requireRoleAuth(['medical-store']), getStoreReviews);

export default router;
