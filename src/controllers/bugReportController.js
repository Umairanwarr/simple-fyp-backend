import mongoose from 'mongoose';
import { Admin } from '../models/Admin.js';
import { BugReport } from '../models/BugReport.js';
import { Clinic } from '../models/Clinic.js';
import { Doctor } from '../models/Doctor.js';
import { MedicalStore } from '../models/MedicalStore.js';
import { Patient } from '../models/Patient.js';

const ALLOWED_REPORTER_ROLES = new Set(['patient', 'doctor', 'clinic', 'medical-store']);
const ALLOWED_BUG_STATUSES = new Set(['open', 'resolved']);

const normalizeText = (value, maxLength = 300) => {
  return String(value || '').trim().slice(0, maxLength);
};

const escapeRegex = (value) => {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const mapBugReportResponse = (bugReportRecord) => {
  return {
    id: String(bugReportRecord?._id || ''),
    reporterRole: String(bugReportRecord?.reporterRole || ''),
    reporterId: String(bugReportRecord?.reporterId || ''),
    reporterName: String(bugReportRecord?.reporterName || '').trim() || 'User',
    reporterEmail: String(bugReportRecord?.reporterEmail || '').trim(),
    subject: String(bugReportRecord?.subject || '').trim(),
    description: String(bugReportRecord?.description || '').trim(),
    status: String(bugReportRecord?.status || 'open').trim().toLowerCase() === 'resolved' ? 'resolved' : 'open',
    createdAt: bugReportRecord?.createdAt || null,
    updatedAt: bugReportRecord?.updatedAt || null,
    reviewedAt: bugReportRecord?.reviewedAt || null,
    reviewedBy: String(bugReportRecord?.reviewedBy || '')
  };
};

const getReporterIdentity = async ({ reporterRole, reporterId }) => {
  if (!reporterRole || !reporterId) {
    return {
      reporterName: 'User',
      reporterEmail: ''
    };
  }

  if (!mongoose.Types.ObjectId.isValid(reporterId)) {
    return {
      reporterName: 'User',
      reporterEmail: ''
    };
  }

  if (reporterRole === 'patient') {
    const patient = await Patient.findById(reporterId)
      .select('firstName lastName email')
      .lean();

    if (!patient) {
      return {
        reporterName: 'Patient',
        reporterEmail: ''
      };
    }

    return {
      reporterName: `${String(patient.firstName || '').trim()} ${String(patient.lastName || '').trim()}`.trim() || 'Patient',
      reporterEmail: normalizeText(patient.email, 180).toLowerCase()
    };
  }

  if (reporterRole === 'doctor') {
    const doctor = await Doctor.findById(reporterId)
      .select('fullName email')
      .lean();

    if (!doctor) {
      return {
        reporterName: 'Doctor',
        reporterEmail: ''
      };
    }

    return {
      reporterName: normalizeText(doctor.fullName, 120) || 'Doctor',
      reporterEmail: normalizeText(doctor.email, 180).toLowerCase()
    };
  }

  if (reporterRole === 'clinic') {
    const clinic = await Clinic.findById(reporterId)
      .select('name email')
      .lean();

    if (!clinic) {
      return {
        reporterName: 'Clinic',
        reporterEmail: ''
      };
    }

    return {
      reporterName: normalizeText(clinic.name, 120) || 'Clinic',
      reporterEmail: normalizeText(clinic.email, 180).toLowerCase()
    };
  }

  if (reporterRole === 'medical-store') {
    const medicalStore = await MedicalStore.findById(reporterId)
      .select('name email')
      .lean();

    if (!medicalStore) {
      return {
        reporterName: 'Medical Store',
        reporterEmail: ''
      };
    }

    return {
      reporterName: normalizeText(medicalStore.name, 120) || 'Medical Store',
      reporterEmail: normalizeText(medicalStore.email, 180).toLowerCase()
    };
  }

  return {
    reporterName: 'User',
    reporterEmail: ''
  };
};

export const submitBugReport = async (req, res) => {
  try {
    const reporterRole = normalizeText(req.user?.role, 40).toLowerCase();
    const reporterId = String(req.user?.id || '').trim();

    if (!ALLOWED_REPORTER_ROLES.has(reporterRole)) {
      return res.status(403).json({ message: 'Only signed-in users can report bugs' });
    }

    const subject = normalizeText(req.body?.subject, 180);
    const description = normalizeText(req.body?.description, 3000);

    if (!subject) {
      return res.status(400).json({ message: 'Bug title is required' });
    }

    if (description.length < 10) {
      return res.status(400).json({ message: 'Please provide at least 10 characters in bug details' });
    }

    const reporterIdentity = await getReporterIdentity({
      reporterRole,
      reporterId
    });

    const bugReport = await BugReport.create({
      reporterRole,
      reporterId: mongoose.Types.ObjectId.isValid(reporterId) ? reporterId : null,
      reporterName: reporterIdentity.reporterName,
      reporterEmail: reporterIdentity.reporterEmail,
      subject,
      description,
      status: 'open'
    });

    return res.status(201).json({
      message: 'Bug report submitted successfully',
      bugReport: mapBugReportResponse(bugReport)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not submit bug report', error: error.message });
  }
};

export const getBugReportsForAdmin = async (req, res) => {
  try {
    const roleFilter = normalizeText(req.query?.role, 40).toLowerCase();
    const statusFilter = normalizeText(req.query?.status, 40).toLowerCase();
    const searchQuery = normalizeText(req.query?.search, 140);
    const filters = {};

    if (ALLOWED_REPORTER_ROLES.has(roleFilter)) {
      filters.reporterRole = roleFilter;
    }

    if (ALLOWED_BUG_STATUSES.has(statusFilter)) {
      filters.status = statusFilter;
    }

    if (searchQuery) {
      const regex = new RegExp(escapeRegex(searchQuery), 'i');
      filters.$or = [
        { reporterName: regex },
        { reporterEmail: regex },
        { subject: regex },
        { description: regex }
      ];
    }

    const bugReports = await BugReport.find(filters)
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();

    return res.status(200).json({
      bugReports: bugReports.map((bugReport) => mapBugReportResponse(bugReport))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch bug reports', error: error.message });
  }
};

export const updateBugReportStatusForAdmin = async (req, res) => {
  try {
    const bugReportId = String(req.params?.bugReportId || '').trim();
    const nextStatus = normalizeText(req.body?.status, 40).toLowerCase();

    if (!mongoose.Types.ObjectId.isValid(bugReportId)) {
      return res.status(400).json({ message: 'Invalid bug report id' });
    }

    if (!ALLOWED_BUG_STATUSES.has(nextStatus)) {
      return res.status(400).json({ message: 'Status must be open or resolved' });
    }

    const bugReport = await BugReport.findByIdAndUpdate(
      bugReportId,
      {
        status: nextStatus,
        reviewedAt: nextStatus === 'resolved' ? new Date() : null,
        reviewedBy: nextStatus === 'resolved' ? req.user?.id || null : null
      },
      {
        new: true
      }
    );

    if (!bugReport) {
      return res.status(404).json({ message: 'Bug report not found' });
    }

    return res.status(200).json({
      message: `Bug report marked as ${nextStatus}`,
      bugReport: mapBugReportResponse(bugReport)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update bug report status', error: error.message });
  }
};

export const deleteBugReportForAdmin = async (req, res) => {
  try {
    const bugReportId = String(req.params?.bugReportId || '').trim();

    if (!mongoose.Types.ObjectId.isValid(bugReportId)) {
      return res.status(400).json({ message: 'Invalid bug report id' });
    }

    const existingAdmin = await Admin.findById(req.user?.id)
      .select('_id')
      .lean();

    if (!existingAdmin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    const deletedBugReport = await BugReport.findByIdAndDelete(bugReportId);

    if (!deletedBugReport) {
      return res.status(404).json({ message: 'Bug report not found' });
    }

    return res.status(200).json({ message: 'Bug report deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not delete bug report', error: error.message });
  }
};
