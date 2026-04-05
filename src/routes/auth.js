import express from 'express';
import adminAuthRoutes from './adminAuthRoutes.js';
import clinicAuthRoutes from './clinicAuthRoutes.js';
import doctorAuthRoutes from './doctorAuthRoutes.js';
import medicalStoreAuthRoutes from './medicalStoreAuthRoutes.js';
import patientAuthRoutes from './patientAuthRoutes.js';

const router = express.Router();

router.use('/admin', adminAuthRoutes);
router.use('/clinic', clinicAuthRoutes);
router.use('/doctor', doctorAuthRoutes);
router.use('/store', medicalStoreAuthRoutes);
router.use('/patient', patientAuthRoutes);

export default router;
