import express from 'express';
import {
  deleteBugReportForAdmin,
  getBugReportsForAdmin,
  submitBugReport,
  updateBugReportStatusForAdmin
} from '../controllers/bugReportController.js';
import { requireAdminAuth } from '../middlewares/auth/requireAdminAuth.js';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';

const router = express.Router();

router.post('/', requireRoleAuth(['patient', 'doctor', 'clinic', 'medical-store']), submitBugReport);
router.get('/admin', requireAdminAuth, getBugReportsForAdmin);
router.patch('/admin/:bugReportId/status', requireAdminAuth, updateBugReportStatusForAdmin);
router.delete('/admin/:bugReportId', requireAdminAuth, deleteBugReportForAdmin);

export default router;
