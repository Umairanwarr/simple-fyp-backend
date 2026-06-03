import express from 'express';
import { getSponsoredAccountsForPatients } from '../controllers/campaignController.js';
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
  getExploreSpecialtiesForPatients,
  markPatientNotificationsAsRead,
  removeDoctorFromPatientFavorites,
  resetPatientPassword,
  registerPatient,
  searchDoctorsForPatients,
  searchStoresForPatients,
  getStoreProfileForPatient,
  createStoreOrder,
  getPatientStoreOrders,
  getPendingStoreReviewOrder,
  submitStoreOrderReview,
  skipStoreOrderReview,
  skipPatientAppointmentReview,
  submitPatientAppointmentReview,
  submitDirectClinicReview,
  sendPatientVerificationOtp,
  updatePatientProfile,
  updatePatientAvatar,
  verifyPatientOtp,
  getPatientPrescriptions
} from '../controllers/auth/patient/index.js';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { handleAvatarUpload } from '../middlewares/uploadAvatar.js';

const router = express.Router();

import {
  searchClinicsForPatients,
  getClinicDoctorsForPatient,
  bookClinicDoctorAppointment,
  createClinicDoctorAppointmentPaymentIntent,
  confirmClinicDoctorAppointmentPayment
} from '../controllers/auth/patient/clinicsController.js';

router.post('/register', registerPatient);
router.post('/send-otp', sendPatientVerificationOtp);
router.post('/verify-otp', verifyPatientOtp);
router.post('/reset-password', resetPatientPassword);
router.post('/login', loginPatient);
router.post('/google-login', loginPatientWithGoogle);
router.get('/specialties', getExploreSpecialtiesForPatients);
router.get('/doctors', searchDoctorsForPatients);
router.get('/stores', searchStoresForPatients);
router.get('/clinics', searchClinicsForPatients);
router.get('/sponsored', getSponsoredAccountsForPatients);
router.get('/clinics/:clinicId/doctors', getClinicDoctorsForPatient);
router.post('/clinics/book', requireRoleAuth(['patient']), bookClinicDoctorAppointment);
router.post('/clinics/appointments/payment-intent', requireRoleAuth(['patient']), createClinicDoctorAppointmentPaymentIntent);
router.post('/clinics/appointments/confirm-payment', requireRoleAuth(['patient']), confirmClinicDoctorAppointmentPayment);
router.get('/stores/:storeId/profile', requireRoleAuth(['patient']), getStoreProfileForPatient);
router.post('/stores/:storeId/orders', requireRoleAuth(['patient']), createStoreOrder);
router.get('/orders', requireRoleAuth(['patient']), getPatientStoreOrders);
router.get('/store-review/pending', requireRoleAuth(['patient']), getPendingStoreReviewOrder);
router.post('/store-review/:orderId/submit', requireRoleAuth(['patient']), submitStoreOrderReview);
router.post('/store-review/:orderId/skip', requireRoleAuth(['patient']), skipStoreOrderReview);
router.get('/profile', requireRoleAuth(['patient']), getPatientProfile);
router.patch('/profile', requireRoleAuth(['patient']), updatePatientProfile);
router.get('/doctors/:doctorId/profile', requireRoleAuth(['patient']), getDoctorProfileForPatient);
router.get('/appointments', requireRoleAuth(['patient']), getPatientAppointments);
router.get('/appointments/history', requireRoleAuth(['patient']), getPatientAppointmentHistory);
router.get('/appointments/pending-review', requireRoleAuth(['patient']), getPatientPendingReviewAppointment);
router.post('/appointments/:appointmentId/review', requireRoleAuth(['patient']), submitPatientAppointmentReview);
router.post('/appointments/:appointmentId/review/skip', requireRoleAuth(['patient']), skipPatientAppointmentReview);
router.post('/clinics/:clinicId/direct-review', requireRoleAuth(['patient']), submitDirectClinicReview);
router.patch('/appointments/:appointmentId/cancel', requireRoleAuth(['patient']), cancelPatientAppointment);
router.post('/appointments/payment-intent', requireRoleAuth(['patient']), createPatientAppointmentPaymentIntent);
router.post('/appointments/confirm-payment', requireRoleAuth(['patient']), confirmPatientAppointmentPayment);
router.get('/notifications', requireRoleAuth(['patient']), getPatientNotifications);
router.patch('/notifications/read', requireRoleAuth(['patient']), markPatientNotificationsAsRead);
router.get('/favorites', requireRoleAuth(['patient']), getPatientFavoriteDoctors);
router.post('/favorites/:doctorId', requireRoleAuth(['patient']), addDoctorToPatientFavorites);
router.delete('/favorites/:doctorId', requireRoleAuth(['patient']), removeDoctorFromPatientFavorites);
router.patch('/avatar', requireRoleAuth(['patient']), handleAvatarUpload, updatePatientAvatar);
router.get('/prescriptions', requireRoleAuth(['patient']), getPatientPrescriptions);

export default router;
