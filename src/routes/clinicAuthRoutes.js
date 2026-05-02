import express from 'express';
import {
  loginClinic,
  registerClinic,
  sendClinicLoginOtp,
  sendClinicVerificationOtp,
  updateClinicAvatar,
  getClinicProfile,
  updateClinicProfile,
  verifyClinicOtp
} from '../controllers/auth/clinicAuthController.js';
import {
  saveClinicBankAccount,
  getClinicBankAccount
} from '../controllers/auth/clinic/withdrawController.js';
import {
  getClinicNotifications,
  markClinicNotificationsAsRead
} from '../controllers/auth/clinic/notificationsController.js';
import {
  getClinicDoctors,
  registerClinicDoctor
} from '../controllers/auth/clinic/staffController.js';
import {
  cancelClinicAppointment,
  createClinicAppointment,
  getClinicAppointments
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
router.post('/login', loginClinic);
router.patch('/avatar', requireRoleAuth(['clinic']), handleAvatarUpload, updateClinicAvatar);
router.get('/profile', requireRoleAuth(['clinic']), getClinicProfile);
router.patch('/profile', requireRoleAuth(['clinic']), updateClinicProfile);
router.get('/doctors', requireRoleAuth(['clinic']), getClinicDoctors);
router.post('/doctors', requireRoleAuth(['clinic']), handleAvatarUpload, registerClinicDoctor);
router.get('/availability', requireRoleAuth(['clinic']), getAllClinicDoctorsAvailability);
router.get('/availability/:doctorId', requireRoleAuth(['clinic']), getClinicDoctorAvailability);
router.post('/availability/:doctorId', requireRoleAuth(['clinic']), createClinicDoctorAvailability);
router.patch('/availability/:doctorId/:slotId', requireRoleAuth(['clinic']), updateClinicDoctorAvailabilitySlot);
router.delete('/availability/:doctorId/:slotId', requireRoleAuth(['clinic']), deleteClinicDoctorAvailabilitySlot);
router.get('/appointments', requireRoleAuth(['clinic']), getClinicAppointments);
router.post('/appointments', requireRoleAuth(['clinic']), createClinicAppointment);
router.patch('/appointments/:appointmentId/cancel', requireRoleAuth(['clinic']), cancelClinicAppointment);
router.get('/bank-account', requireRoleAuth(['clinic']), getClinicBankAccount);
router.put('/bank-account', requireRoleAuth(['clinic']), saveClinicBankAccount);
router.get('/notifications', requireRoleAuth(['clinic']), getClinicNotifications);
router.patch('/notifications/mark-read', requireRoleAuth(['clinic']), markClinicNotificationsAsRead);

export default router;
