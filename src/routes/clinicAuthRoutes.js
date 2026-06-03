import express from 'express';
import {
  confirmCampaignCheckoutSession,
  createCampaignCheckoutSession,
  getCampaignPricing,
  getCampaignStatus
} from '../controllers/campaignController.js';
import {
  loginClinic,
  registerClinic,
  resetClinicPassword,
  sendClinicLoginOtp,
  sendClinicVerificationOtp,
  updateClinicAvatar,
  getClinicProfile,
  updateClinicProfile,
  verifyClinicOtp
} from '../controllers/auth/clinicAuthController.js';
import {
  saveClinicBankAccount,
  getClinicBankAccount,
  createWithdrawRequest,
  getClinicWithdrawRequests
} from '../controllers/auth/clinic/withdrawController.js';
import {
  getClinicNotifications,
  markClinicNotificationsAsRead
} from '../controllers/auth/clinic/notificationsController.js';
import { getClinicAnalytics } from '../controllers/auth/clinic/analyticsController.js';
import {
  cancelClinicSubscription,
  confirmClinicSubscriptionCheckoutSession,
  createClinicSubscriptionCheckoutSession,
  getClinicSubscriptionPricing,
  getClinicSubscriptionStatus
} from '../controllers/auth/clinic/subscriptionController.js';
import { getClinicReviews } from '../controllers/auth/clinic/reviewsController.js';
import {
  getClinicDoctors,
  registerClinicDoctor,
  updateClinicDoctor,
  deleteClinicDoctor
} from '../controllers/auth/clinic/staffController.js';
import {
  createClinicService,
  createClinicServiceAvailability,
  deleteClinicService,
  deleteClinicServiceAvailabilitySlot,
  getClinicServiceAvailability,
  getClinicServices,
  updateClinicService,
  updateClinicServiceAvailabilitySlot
} from '../controllers/auth/clinic/serviceController.js';
import {
  cancelClinicAppointment,
  createClinicAppointment,
  getClinicAppointments,
  rescheduleClinicAppointment
} from '../controllers/auth/clinic/appointmentsController.js';
import {
  getClinicDoctorAvailability,
  getAllClinicDoctorsAvailability,
  createClinicDoctorAvailability,
  updateClinicDoctorAvailabilitySlot,
  deleteClinicDoctorAvailabilitySlot
} from '../controllers/auth/clinic/availabilityController.js';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { handleAvatarUpload } from '../middlewares/uploadAvatar.js';
import { handleClinicPermitUpload } from '../middlewares/uploadClinicPermit.js';

const router = express.Router();

router.post('/register', handleClinicPermitUpload, registerClinic);
router.post('/send-otp', sendClinicVerificationOtp);
router.post('/send-login-otp', sendClinicLoginOtp);
router.post('/verify-otp', verifyClinicOtp);
router.post('/reset-password', resetClinicPassword);
router.post('/login', loginClinic);
router.patch('/avatar', requireRoleAuth(['clinic']), handleAvatarUpload, updateClinicAvatar);
router.get('/profile', requireRoleAuth(['clinic']), getClinicProfile);
router.patch('/profile', requireRoleAuth(['clinic']), updateClinicProfile);
router.get('/analytics', requireRoleAuth(['clinic']), getClinicAnalytics);
router.get('/subscription-pricing', requireRoleAuth(['clinic']), getClinicSubscriptionPricing);
router.get('/subscription-status', requireRoleAuth(['clinic']), getClinicSubscriptionStatus);
router.post('/create-subscription-checkout', requireRoleAuth(['clinic']), createClinicSubscriptionCheckoutSession);
router.post('/confirm-subscription-checkout', requireRoleAuth(['clinic']), confirmClinicSubscriptionCheckoutSession);
router.patch('/cancel-subscription', requireRoleAuth(['clinic']), cancelClinicSubscription);
router.get('/doctors', requireRoleAuth(['clinic']), getClinicDoctors);
router.post('/doctors', requireRoleAuth(['clinic']), handleAvatarUpload, registerClinicDoctor);
router.patch('/doctors/:doctorId', requireRoleAuth(['clinic']), handleAvatarUpload, updateClinicDoctor);
router.delete('/doctors/:doctorId', requireRoleAuth(['clinic']), deleteClinicDoctor);
router.get('/services', requireRoleAuth(['clinic']), getClinicServices);
router.post('/services', requireRoleAuth(['clinic']), handleAvatarUpload, createClinicService);
router.patch('/services/:serviceId', requireRoleAuth(['clinic']), handleAvatarUpload, updateClinicService);
router.delete('/services/:serviceId', requireRoleAuth(['clinic']), deleteClinicService);
router.get('/services/:serviceId/availability', requireRoleAuth(['clinic']), getClinicServiceAvailability);
router.post('/services/:serviceId/availability', requireRoleAuth(['clinic']), createClinicServiceAvailability);
router.patch('/services/:serviceId/availability/:slotId', requireRoleAuth(['clinic']), updateClinicServiceAvailabilitySlot);
router.delete('/services/:serviceId/availability/:slotId', requireRoleAuth(['clinic']), deleteClinicServiceAvailabilitySlot);
router.get('/availability', requireRoleAuth(['clinic']), getAllClinicDoctorsAvailability);
router.get('/availability/:doctorId', requireRoleAuth(['clinic']), getClinicDoctorAvailability);
router.post('/availability/:doctorId', requireRoleAuth(['clinic']), createClinicDoctorAvailability);
router.patch('/availability/:doctorId/:slotId', requireRoleAuth(['clinic']), updateClinicDoctorAvailabilitySlot);
router.delete('/availability/:doctorId/:slotId', requireRoleAuth(['clinic']), deleteClinicDoctorAvailabilitySlot);
router.get('/appointments', requireRoleAuth(['clinic']), getClinicAppointments);
router.post('/appointments', requireRoleAuth(['clinic']), createClinicAppointment);
router.patch('/appointments/:appointmentId/cancel', requireRoleAuth(['clinic']), cancelClinicAppointment);
router.patch('/appointments/:appointmentId/reschedule', requireRoleAuth(['clinic']), rescheduleClinicAppointment);
router.get('/reviews', requireRoleAuth(['clinic']), getClinicReviews);
router.get('/campaign/pricing', requireRoleAuth(['clinic']), getCampaignPricing);
router.get('/campaign/status', requireRoleAuth(['clinic']), getCampaignStatus);
router.post('/campaign/checkout-session', requireRoleAuth(['clinic']), createCampaignCheckoutSession);
router.post('/campaign/confirm', requireRoleAuth(['clinic']), confirmCampaignCheckoutSession);
router.get('/bank-account', requireRoleAuth(['clinic']), getClinicBankAccount);
router.put('/bank-account', requireRoleAuth(['clinic']), saveClinicBankAccount);
router.get('/withdraw-requests', requireRoleAuth(['clinic']), getClinicWithdrawRequests);
router.post('/withdraw-requests', requireRoleAuth(['clinic']), createWithdrawRequest);
router.get('/notifications', requireRoleAuth(['clinic']), getClinicNotifications);
router.patch('/notifications/mark-read', requireRoleAuth(['clinic']), markClinicNotificationsAsRead);

export default router;
