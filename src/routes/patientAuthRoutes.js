import express from 'express';
import {
  addDoctorToPatientFavorites,
  cancelPatientAppointment,
  confirmPatientAppointmentPayment,
  createPatientAppointmentPaymentIntent,
  getPatientAppointmentHistory,
  getDoctorProfileForPatient,
  getPatientAppointments,
  getPatientFavoriteDoctors,
  getPatientPendingReviewAppointment,
  getPatientNotifications,
  getPatientProfile,
  loginPatientWithGoogle,
  loginPatient,
  markPatientNotificationsAsRead,
  removeDoctorFromPatientFavorites,
  resetPatientPassword,
  registerPatient,
  searchDoctorsForPatients,
  skipPatientAppointmentReview,
  submitPatientAppointmentReview,
  sendPatientVerificationOtp,
  updatePatientProfile,
  updatePatientAvatar,
  verifyPatientOtp
} from '../controllers/auth/patient/index.js';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { handleAvatarUpload } from '../middlewares/uploadAvatar.js';

const router = express.Router();

router.post('/register', registerPatient);
router.post('/send-otp', sendPatientVerificationOtp);
router.post('/verify-otp', verifyPatientOtp);
router.post('/reset-password', resetPatientPassword);
router.post('/login', loginPatient);
router.post('/google-login', loginPatientWithGoogle);
router.get('/doctors', searchDoctorsForPatients);
router.get('/profile', requireRoleAuth(['patient']), getPatientProfile);
router.patch('/profile', requireRoleAuth(['patient']), updatePatientProfile);
router.get('/doctors/:doctorId/profile', requireRoleAuth(['patient']), getDoctorProfileForPatient);
router.get('/appointments', requireRoleAuth(['patient']), getPatientAppointments);
router.get('/appointments/history', requireRoleAuth(['patient']), getPatientAppointmentHistory);
router.get('/appointments/pending-review', requireRoleAuth(['patient']), getPatientPendingReviewAppointment);
router.post('/appointments/:appointmentId/review', requireRoleAuth(['patient']), submitPatientAppointmentReview);
router.post('/appointments/:appointmentId/review/skip', requireRoleAuth(['patient']), skipPatientAppointmentReview);
router.patch('/appointments/:appointmentId/cancel', requireRoleAuth(['patient']), cancelPatientAppointment);
router.post('/appointments/payment-intent', requireRoleAuth(['patient']), createPatientAppointmentPaymentIntent);
router.post('/appointments/confirm-payment', requireRoleAuth(['patient']), confirmPatientAppointmentPayment);
router.get('/notifications', requireRoleAuth(['patient']), getPatientNotifications);
router.patch('/notifications/read', requireRoleAuth(['patient']), markPatientNotificationsAsRead);
router.get('/favorites', requireRoleAuth(['patient']), getPatientFavoriteDoctors);
router.post('/favorites/:doctorId', requireRoleAuth(['patient']), addDoctorToPatientFavorites);
router.delete('/favorites/:doctorId', requireRoleAuth(['patient']), removeDoctorFromPatientFavorites);
router.patch('/avatar', requireRoleAuth(['patient']), handleAvatarUpload, updatePatientAvatar);

export default router;
