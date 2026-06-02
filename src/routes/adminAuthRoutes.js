import express from 'express';
import {
  getAdminNotifications,
  markAdminNotificationsAsRead,
  deleteDoctorReviewForAdmin,
  deleteClinicReviewForAdmin,
  deleteClinicForAdmin,
  deleteDoctorForAdmin,
  deleteMedicalStoreForAdmin,
  deletePatientForAdmin,
  getDoctorReviewsForAdmin,
  getClinicReviewsForAdmin,
  getStoreReviewsForAdmin,
  deleteStoreReviewForAdmin,
  getClinicsForAdmin,
  getDoctorsForAdmin,
  getMedicalStoresForAdmin,
  getAdminStats,
  getPatientsForAdmin,
  loginAdmin,
  getStoreSubscriptionPricingForAdmin,
  updateStoreSubscriptionPricingForAdmin,
  getClinicSubscriptionPricingForAdmin,
  updateClinicSubscriptionPricingForAdmin,
  reviewClinicApplicationForAdmin,
  reviewMedicalStoreApplicationForAdmin,
  reviewDoctorApplicationForAdmin
} from '../controllers/auth/adminAuthController.js';
import {
  getCampaignPricing,
  getPromotedAccountsForAdmin,
  updateCampaignPricingForAdmin
} from '../controllers/campaignController.js';
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
router.get('/reviews/clinic', requireAdminAuth, getClinicReviewsForAdmin);
router.delete('/reviews/clinic/:reviewId', requireAdminAuth, deleteClinicReviewForAdmin);
router.get('/reviews/store', requireAdminAuth, getStoreReviewsForAdmin);
router.delete('/reviews/store/:reviewId', requireAdminAuth, deleteStoreReviewForAdmin);
router.get('/subscription-pricing/medical-store', requireAdminAuth, getStoreSubscriptionPricingForAdmin);
router.patch('/subscription-pricing/medical-store', requireAdminAuth, updateStoreSubscriptionPricingForAdmin);
router.get('/subscription-pricing/clinic', requireAdminAuth, getClinicSubscriptionPricingForAdmin);
router.patch('/subscription-pricing/clinic', requireAdminAuth, updateClinicSubscriptionPricingForAdmin);
router.get('/campaign-pricing', requireAdminAuth, getCampaignPricing);
router.patch('/campaign-pricing', requireAdminAuth, updateCampaignPricingForAdmin);
router.get('/promoted-accounts', requireAdminAuth, getPromotedAccountsForAdmin);
router.get('/media-moderation', requireAdminAuth, getAdminDoctorMediaModeration);
router.patch('/media-moderation/:mediaId/review', requireAdminAuth, reviewAdminDoctorMedia);
router.get('/withdraw-requests', requireAdminAuth, getAdminWithdrawRequests);
router.patch('/withdraw-requests/:requestId/review', requireAdminAuth, reviewWithdrawRequest);

export default router;
