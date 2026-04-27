import express from 'express';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { handleDoctorMediaUpload } from '../middlewares/uploadDoctorMedia.js';
import {
  getClinicMediaLibrary,
  uploadClinicMedia,
  deleteClinicMedia
} from '../controllers/clinicMediaController.js';

const router = express.Router();

// All routes require clinic authentication
router.use(requireRoleAuth(['clinic']));

router.get('/', getClinicMediaLibrary);
router.post('/', handleDoctorMediaUpload, uploadClinicMedia); // reuse same multer middleware (images + videos)
router.delete('/:mediaId', deleteClinicMedia);

export default router;
