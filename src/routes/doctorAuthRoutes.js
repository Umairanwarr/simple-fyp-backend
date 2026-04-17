import express from 'express';
import {
  cancelDoctorSubscription,
  cancelDoctorUpcomingAppointment,
  confirmDoctorSubscriptionCheckoutSession,
  createDoctorSubscriptionCheckoutSession,
  deleteDoctorMedia,
  createDoctorAvailability,
  deleteDoctorAvailabilitySlot,
  getDoctorAnalytics,
  getDoctorAppointments,
  getDoctorNotifications,
  getDoctorProfile,
  getDoctorReviews,
  getDoctorSchedule,
  getDoctorMediaLibrary,
  getDoctorSubscriptionStatus,
  getDoctorSubscriptionPricing,
  getDoctorAvailability,
  loginDoctor,
  markDoctorNotificationsAsRead,
  registerDoctor,
  rescheduleDoctorUpcomingAppointment,
  sendDoctorLoginOtp,
  sendDoctorVerificationOtp,
  updateDoctorProfile,
  updateDoctorAvailabilitySlot,
  updateDoctorAvatar,
  uploadDoctorMedia,
  verifyDoctorOtp,
  getDoctorCompletedPatients,
  createDoctorPrescription,
  getDoctorPrescriptions,
  deleteDoctorPrescription,
  saveDoctorBankAccount,
  getDoctorBankAccount,
  createWithdrawRequest,
  getDoctorWithdrawRequests
} from '../controllers/auth/doctor/index.js';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { handleAvatarUpload } from '../middlewares/uploadAvatar.js';
import { handleDoctorMediaUpload } from '../middlewares/uploadDoctorMedia.js';
import { handleDoctorLicenseUpload } from '../middlewares/uploadDoctorLicense.js';
import { handlePrescriptionUpload } from '../middlewares/uploadPrescription.js';

const router = express.Router();

router.post('/register', handleDoctorLicenseUpload, registerDoctor);
router.post('/send-otp', sendDoctorVerificationOtp);
router.post('/send-login-otp', sendDoctorLoginOtp);
router.post('/verify-otp', verifyDoctorOtp);
router.post('/login', loginDoctor);
router.get('/analytics', requireRoleAuth(['doctor']), getDoctorAnalytics);
router.get('/notifications', requireRoleAuth(['doctor']), getDoctorNotifications);
router.patch('/notifications/read', requireRoleAuth(['doctor']), markDoctorNotificationsAsRead);
router.get('/reviews', requireRoleAuth(['doctor']), getDoctorReviews);
router.get('/schedule', requireRoleAuth(['doctor']), getDoctorSchedule);
router.get('/appointments', requireRoleAuth(['doctor']), getDoctorAppointments);
router.get('/subscription-pricing', requireRoleAuth(['doctor']), getDoctorSubscriptionPricing);
router.get('/subscription/status', requireRoleAuth(['doctor']), getDoctorSubscriptionStatus);
router.post('/subscription/checkout-session', requireRoleAuth(['doctor']), createDoctorSubscriptionCheckoutSession);
router.post('/subscription/confirm', requireRoleAuth(['doctor']), confirmDoctorSubscriptionCheckoutSession);
router.patch('/subscription/cancel', requireRoleAuth(['doctor']), cancelDoctorSubscription);
router.patch('/appointments/:appointmentId/cancel', requireRoleAuth(['doctor']), cancelDoctorUpcomingAppointment);
router.patch('/appointments/:appointmentId/reschedule', requireRoleAuth(['doctor']), rescheduleDoctorUpcomingAppointment);
router.get('/media', requireRoleAuth(['doctor']), getDoctorMediaLibrary);
router.post('/media', requireRoleAuth(['doctor']), handleDoctorMediaUpload, uploadDoctorMedia);
router.delete('/media/:mediaId', requireRoleAuth(['doctor']), deleteDoctorMedia);
router.get('/profile', requireRoleAuth(['doctor']), getDoctorProfile);
router.patch('/profile', requireRoleAuth(['doctor']), updateDoctorProfile);
router.get('/availability', requireRoleAuth(['doctor']), getDoctorAvailability);
router.post('/availability', requireRoleAuth(['doctor']), createDoctorAvailability);
router.patch('/availability/:slotId', requireRoleAuth(['doctor']), updateDoctorAvailabilitySlot);
router.delete('/availability/:slotId', requireRoleAuth(['doctor']), deleteDoctorAvailabilitySlot);
router.patch('/avatar', requireRoleAuth(['doctor']), handleAvatarUpload, updateDoctorAvatar);
router.get('/prescriptions/patients', requireRoleAuth(['doctor']), getDoctorCompletedPatients);
router.get('/prescriptions', requireRoleAuth(['doctor']), getDoctorPrescriptions);
router.post('/prescriptions', requireRoleAuth(['doctor']), handlePrescriptionUpload, createDoctorPrescription);
router.delete('/prescriptions/:prescriptionId', requireRoleAuth(['doctor']), deleteDoctorPrescription);

router.get('/bank-account', requireRoleAuth(['doctor']), getDoctorBankAccount);
router.put('/bank-account', requireRoleAuth(['doctor']), saveDoctorBankAccount);
router.get('/withdraw-requests', requireRoleAuth(['doctor']), getDoctorWithdrawRequests);
router.post('/withdraw-requests', requireRoleAuth(['doctor']), createWithdrawRequest);

export default router;
