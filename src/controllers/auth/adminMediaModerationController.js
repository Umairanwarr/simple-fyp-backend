import mongoose from 'mongoose';
import { DoctorMedia } from '../../models/DoctorMedia.js';

const escapeRegex = (value) => {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const normalizeQueryStatus = (statusValue) => {
  const normalizedStatus = String(statusValue || '').trim().toLowerCase();

  if (['pending', 'approved', 'rejected', 'all'].includes(normalizedStatus)) {
    return normalizedStatus;
  }

  return 'pending';
};

const normalizeReviewStatus = (statusValue) => {
  const normalizedStatus = String(statusValue || '').trim().toLowerCase();

  if (normalizedStatus === 'approve') {
    return 'approved';
  }

  if (normalizedStatus === 'decline') {
    return 'rejected';
  }

  if (normalizedStatus === 'approved' || normalizedStatus === 'rejected') {
    return normalizedStatus;
  }

  return '';
};

const mapDoctorMediaModerationRecord = (mediaRecord) => {
  return {
    id: String(mediaRecord?._id || ''),
    uploaderRole: String(mediaRecord?.uploaderRole || 'doctor'),
    // Doctor fields
    doctorId: String(mediaRecord?.doctorId || ''),
    doctorName: String(mediaRecord?.doctorName || '').trim() || 'Doctor',
    doctorEmail: String(mediaRecord?.doctorEmail || '').trim() || 'N/A',
    // Store fields
    storeName: String(mediaRecord?.storeName || '').trim() || '',
    storeEmail: String(mediaRecord?.storeEmail || '').trim() || '',
    // Clinic fields
    clinicName: String(mediaRecord?.clinicName || '').trim() || '',
    clinicEmail: String(mediaRecord?.clinicEmail || '').trim() || '',
    // Shared
    mediaType: String(mediaRecord?.mediaType || '').trim().toLowerCase() === 'video' ? 'video' : 'image',
    url: String(mediaRecord?.asset?.url || '').trim(),
    originalName: String(mediaRecord?.asset?.originalName || '').trim() || 'media-file',
    moderationStatus: String(mediaRecord?.moderationStatus || '').trim().toLowerCase() || 'pending',
    moderationNote: String(mediaRecord?.moderationNote || '').trim(),
    reviewedAt: mediaRecord?.reviewedAt || null,
    uploadedAt: mediaRecord?.createdAt || null
  };
};

const buildMatchStage = ({ status, query }) => {
  const matchStage = {
    deletedAt: null
  };

  if (status !== 'all') {
    matchStage.moderationStatus = status;
  }

  if (query) {
    const safeRegex = new RegExp(escapeRegex(query), 'i');
    matchStage.$or = [
      { doctorName: safeRegex },
      { doctorEmail: safeRegex },
      { storeName: safeRegex },
      { storeEmail: safeRegex },
      { clinicName: safeRegex },
      { clinicEmail: safeRegex },
      { 'asset.originalName': safeRegex }
    ];
  }

  return matchStage;
};

export const getAdminDoctorMediaModeration = async (req, res) => {
  try {
    const status = normalizeQueryStatus(req.query?.status);
    const query = String(req.query?.q || '').trim();

    const matchStage = buildMatchStage({ status, query });

    const [mediaRecords, aggregateCounts] = await Promise.all([
      DoctorMedia.find(matchStage)
        .sort({ createdAt: -1 })
        .limit(400)
        .lean(),
      DoctorMedia.aggregate([
        {
          $match: {
            deletedAt: null
          }
        },
        {
          $group: {
            _id: '$moderationStatus',
            count: {
              $sum: 1
            }
          }
        }
      ])
    ]);

    const summary = {
      pending: 0,
      approved: 0,
      rejected: 0
    };

    aggregateCounts.forEach((entry) => {
      const normalizedStatus = String(entry?._id || '').trim().toLowerCase();

      if (!Object.prototype.hasOwnProperty.call(summary, normalizedStatus)) {
        return;
      }

      summary[normalizedStatus] = Math.max(0, Math.trunc(Number(entry?.count || 0)));
    });

    return res.status(200).json({
      media: mediaRecords.map((mediaRecord) => mapDoctorMediaModerationRecord(mediaRecord)),
      status,
      summary
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not fetch media moderation list',
      error: error.message
    });
  }
};

export const reviewAdminDoctorMedia = async (req, res) => {
  try {
    const mediaId = String(req.params?.mediaId || '').trim();

    if (!mongoose.Types.ObjectId.isValid(mediaId)) {
      return res.status(400).json({ message: 'Invalid media id' });
    }

    const normalizedStatus = normalizeReviewStatus(req.body?.status);

    if (!normalizedStatus) {
      return res.status(400).json({ message: 'Status must be approved or rejected' });
    }

    const incomingNote = String(req.body?.note || req.body?.moderationNote || '').trim().slice(0, 500);
    const moderationNote = normalizedStatus === 'approved' ? '' : incomingNote;

    const mediaRecord = await DoctorMedia.findOne({
      _id: mediaId,
      deletedAt: null
    });

    if (!mediaRecord) {
      return res.status(404).json({ message: 'Media item not found' });
    }

    mediaRecord.moderationStatus = normalizedStatus;
    mediaRecord.moderationNote = moderationNote;
    mediaRecord.reviewedAt = new Date();
    mediaRecord.reviewedBy = req.user?.id || null;
    await mediaRecord.save();

    return res.status(200).json({
      message: `Media ${normalizedStatus === 'approved' ? 'approved' : 'rejected'} successfully`,
      media: mapDoctorMediaModerationRecord(mediaRecord)
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not review media',
      error: error.message
    });
  }
};
