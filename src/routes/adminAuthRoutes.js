import express from 'express';
import {
  getAdminNotifications,
  markAdminNotificationsAsRead,
  deleteDoctorReviewForAdmin,
  getDoctorSubscriptionPricingForAdmin,
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
  updateDoctorSubscriptionPricingForAdmin,
  getStoreSubscriptionPricingForAdmin,
  updateStoreSubscriptionPricingForAdmin,
  reviewClinicApplicationForAdmin,
  reviewMedicalStoreApplicationForAdmin,
  reviewDoctorApplicationForAdmin
} from '../controllers/auth/adminAuthController.js';
import {
  getAdminDoctorMediaModeration,
  reviewAdminDoctorMedia
} from '../controllers/auth/adminMediaModerationController.js';
import {
  getAdminWithdrawRequests,
  reviewWithdrawRequest
} from '../controllers/auth/admin/withdrawController.js';
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
router.get('/subscription-pricing/doctor', requireAdminAuth, getDoctorSubscriptionPricingForAdmin);
router.patch('/subscription-pricing/doctor', requireAdminAuth, updateDoctorSubscriptionPricingForAdmin);
router.get('/subscription-pricing/medical-store', requireAdminAuth, getStoreSubscriptionPricingForAdmin);
router.patch('/subscription-pricing/medical-store', requireAdminAuth, updateStoreSubscriptionPricingForAdmin);
router.get('/media-moderation', requireAdminAuth, getAdminDoctorMediaModeration);
router.patch('/media-moderation/:mediaId/review', requireAdminAuth, reviewAdminDoctorMedia);
router.get('/withdraw-requests', requireAdminAuth, getAdminWithdrawRequests);
router.patch('/withdraw-requests/:requestId/review', requireAdminAuth, reviewWithdrawRequest);

export default router;
