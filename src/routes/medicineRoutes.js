import express from 'express';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import {
  getMedicines,
  addMedicine,
  updateMedicine,
  deleteMedicine,
  uploadMedicineImage
} from '../controllers/medicineController.js';
import { handleMedicineImageUpload } from '../middlewares/uploadMedicineImage.js';

const router = express.Router();

// All medicine routes require medical-store role
router.use(requireRoleAuth(['medical-store']));

router.get('/', getMedicines);
router.post('/', addMedicine);
router.post('/upload-image', handleMedicineImageUpload, uploadMedicineImage);
router.put('/:id', updateMedicine);
router.delete('/:id', deleteMedicine);

export default router;
