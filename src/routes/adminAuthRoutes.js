import express from 'express';
import {
  deletePatientForAdmin,
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
router.patch('/doctors/:doctorId/review', requireAdminAuth, reviewDoctorApplicationForAdmin);
router.get('/clinics', requireAdminAuth, getClinicsForAdmin);
router.patch('/clinics/:clinicId/review', requireAdminAuth, reviewClinicApplicationForAdmin);
router.get('/stores', requireAdminAuth, getMedicalStoresForAdmin);
router.patch('/stores/:storeId/review', requireAdminAuth, reviewMedicalStoreApplicationForAdmin);
router.get('/stats', requireAdminAuth, getAdminStats);

export default router;
