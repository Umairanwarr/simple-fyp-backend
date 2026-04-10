import express from 'express';
import {
  cancelDoctorUpcomingAppointment,
  createDoctorAvailability,
  deleteDoctorAvailabilitySlot,
  getDoctorAnalytics,
  getDoctorAppointments,
  getDoctorNotifications,
  getDoctorProfile,
  getDoctorReviews,
  getDoctorSchedule,
  getDoctorAvailability,
  loginDoctor,
  markDoctorNotificationsAsRead,
  registerDoctor,
  sendDoctorLoginOtp,
  sendDoctorVerificationOtp,
  updateDoctorProfile,
  updateDoctorAvailabilitySlot,
  updateDoctorAvatar,
  verifyDoctorOtp
} from '../controllers/auth/doctor/index.js';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { handleAvatarUpload } from '../middlewares/uploadAvatar.js';
import { handleDoctorLicenseUpload } from '../middlewares/uploadDoctorLicense.js';

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
router.patch('/appointments/:appointmentId/cancel', requireRoleAuth(['doctor']), cancelDoctorUpcomingAppointment);
router.get('/profile', requireRoleAuth(['doctor']), getDoctorProfile);
router.patch('/profile', requireRoleAuth(['doctor']), updateDoctorProfile);
router.get('/availability', requireRoleAuth(['doctor']), getDoctorAvailability);
router.post('/availability', requireRoleAuth(['doctor']), createDoctorAvailability);
router.patch('/availability/:slotId', requireRoleAuth(['doctor']), updateDoctorAvailabilitySlot);
router.delete('/availability/:slotId', requireRoleAuth(['doctor']), deleteDoctorAvailabilitySlot);
router.patch('/avatar', requireRoleAuth(['doctor']), handleAvatarUpload, updateDoctorAvatar);

export default router;
