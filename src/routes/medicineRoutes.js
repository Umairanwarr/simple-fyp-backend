import express from 'express';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import {
  getMedicines,
  addMedicine,
  updateMedicine,
  deleteMedicine
} from '../controllers/medicineController.js';

const router = express.Router();

// All medicine routes require medical-store role
router.use(requireRoleAuth(['medical-store']));

router.get('/', getMedicines);
router.post('/', addMedicine);
router.put('/:id', updateMedicine);
router.delete('/:id', deleteMedicine);

export default router;
