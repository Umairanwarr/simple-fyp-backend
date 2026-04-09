import express from 'express';
import {
  getAdminNotifications,
  markAdminNotificationsAsRead,
  deleteDoctorReviewForAdmin,
  deleteClinicForAdmin,
  deleteDoctorForAdmin,
  deleteMedicalStoreForAdmin,
  deletePatientForAdmin,
  getDoctorReviewsForAdmin,
  getClinicsForAdmin,
  getDoctorsForAdmin,
  getMedicalStoresForAdmin,
  getAdminStats,
  getPatientsForAdmin,
  loginAdmin,
  reviewClinicApplicationForAdmin,
  reviewMedicalStoreApplicationForAdmin,
  reviewDoctorApplicationForAdmin
} from '../controllers/auth/adminAuthController.js';
import { requireAdminAuth } from '../middlewares/auth/requireAdminAuth.js';

const router = express.Router();

router.post('/login', loginAdmin);
router.get('/patients', requireAdminAuth, getPatientsForAdmin);
router.delete('/patients/:patientId', requireAdminAuth, deletePatientForAdmin);
router.get('/doctors', requireAdminAuth, getDoctorsForAdmin);
router.delete('/doctors/:doctorId', requireAdminAuth, deleteDoctorForAdmin);
router.patch('/doctors/:doctorId/review', requireAdminAuth, reviewDoctorApplicationForAdmin);
router.get('/clinics', requireAdminAuth, getClinicsForAdmin);
router.delete('/clinics/:clinicId', requireAdminAuth, deleteClinicForAdmin);
router.patch('/clinics/:clinicId/review', requireAdminAuth, reviewClinicApplicationForAdmin);
router.get('/stores', requireAdminAuth, getMedicalStoresForAdmin);
router.delete('/stores/:storeId', requireAdminAuth, deleteMedicalStoreForAdmin);
router.patch('/stores/:storeId/review', requireAdminAuth, reviewMedicalStoreApplicationForAdmin);
router.get('/stats', requireAdminAuth, getAdminStats);
router.get('/notifications', requireAdminAuth, getAdminNotifications);
router.patch('/notifications/read', requireAdminAuth, markAdminNotificationsAsRead);
router.get('/reviews', requireAdminAuth, getDoctorReviewsForAdmin);
router.delete('/reviews/:reviewId', requireAdminAuth, deleteDoctorReviewForAdmin);

export default router;
