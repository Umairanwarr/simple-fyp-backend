import express from 'express';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { handleDoctorMediaUpload } from '../middlewares/uploadDoctorMedia.js';
import {
  getStoreMediaLibrary,
  uploadStoreMedia,
  deleteStoreMedia
} from '../controllers/storeMediaController.js';

const router = express.Router();

// All routes require medical-store authentication
router.use(requireRoleAuth(['medical-store']));

router.get('/', getStoreMediaLibrary);
router.post('/', handleDoctorMediaUpload, uploadStoreMedia); // reuse same multer middleware (images + videos)
router.delete('/:mediaId', deleteStoreMedia);

export default router;
