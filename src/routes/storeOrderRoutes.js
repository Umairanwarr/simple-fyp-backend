import express from 'express';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { handlePrescriptionUpload } from '../middlewares/uploadPrescription.js';
import {
  getStoreOrders,
  getStoreOrderById,
  updateOrderStatus,
  deleteStoreOrder,
  submitPatientOrder
} from '../controllers/storeOrderController.js';

const router = express.Router();

// ─── Patient: Submit an order (public, no auth required) ───
router.post('/submit', handlePrescriptionUpload, submitPatientOrder);

// ─── Store: All routes below require medical-store auth ───
router.use(requireRoleAuth(['medical-store']));

router.get('/', getStoreOrders);
router.get('/:id', getStoreOrderById);
router.patch('/:id/status', updateOrderStatus);
router.delete('/:id', deleteStoreOrder);

export default router;
