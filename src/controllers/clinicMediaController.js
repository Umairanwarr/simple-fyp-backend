import mongoose from 'mongoose';
import { DoctorMedia } from '../models/DoctorMedia.js';
import { Clinic } from '../models/Clinic.js';
import { deleteFromCloudinary, uploadClinicMediaToCloudinary } from '../services/cloudinaryService.js';

const PLAN_MEDIA_LIMITS = {
  platinum: { maxImages: 2, maxVideos: 0 },
  gold: { maxImages: 5, maxVideos: 0 },
  diamond: { maxImages: null, maxVideos: null }
};

const getMediaTypeFromMime = (mimeTypeValue) => {
  const mimeType = String(mimeTypeValue || '').trim().toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return '';
};

const normalizePlan = (planValue) => {
  const normalizedPlan = String(planValue || '').trim().toLowerCase();
  return ['platinum', 'gold', 'diamond'].includes(normalizedPlan) ? normalizedPlan : 'platinum';
};

const normalizeSubscriptionStatus = (statusValue) => {
  const normalizedStatus = String(statusValue || '').trim().toLowerCase();
  return ['active', 'cancelled', 'expired'].includes(normalizedStatus) ? normalizedStatus : 'active';
};

const toDateTimestamp = (dateValue) => {
  const parsedDate = dateValue ? new Date(dateValue) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) return 0;
  return parsedDate.getTime();
};

const resolveEffectiveClinicPlan = (clinicRecord, now = new Date()) => {
  const normalizedPlan = normalizePlan(clinicRecord?.currentPlan);
  const normalizedStatus = normalizeSubscriptionStatus(clinicRecord?.subscriptionStatus);
  const planExpiryTimestamp = toDateTimestamp(clinicRecord?.planExpiresAt);

  if (normalizedPlan !== 'platinum' && normalizedStatus === 'active' && planExpiryTimestamp > now.getTime()) {
    return normalizedPlan;
  }

  return 'platinum';
};

const getPlanLimits = (planValue) => PLAN_MEDIA_LIMITS[normalizePlan(planValue)] || PLAN_MEDIA_LIMITS.platinum;

const mapClinicMediaRecord = (record) => ({
  id: String(record?._id || ''),
  mediaType: String(record?.mediaType || '') === 'video' ? 'video' : 'image',
  url: String(record?.asset?.url || ''),
  originalName: String(record?.asset?.originalName || '') || 'media-file',
  format: record?.asset?.format || null,
  bytes: record?.asset?.bytes || 0,
  moderationStatus: String(record?.moderationStatus || 'pending'),
  moderationNote: String(record?.moderationNote || ''),
  reviewedAt: record?.reviewedAt || null,
  uploadedAt: record?.createdAt || null,
  uploaderRole: 'clinic'
});

const getUsageSummary = (mediaRecords) => ({
  imageCount: mediaRecords.filter((item) => item.mediaType === 'image' && ['pending', 'approved'].includes(item.moderationStatus)).length,
  videoCount: mediaRecords.filter((item) => item.mediaType === 'video' && ['pending', 'approved'].includes(item.moderationStatus)).length
});

const isLimitReached = ({ limits, mediaType, usage }) => {
  if (mediaType === 'image') {
    if (limits.maxImages === null) return false;
    return usage.imageCount >= limits.maxImages;
  }

  if (limits.maxVideos === null) return false;
  return usage.videoCount >= limits.maxVideos;
};

const getLimitErrorMessage = ({ effectivePlan, mediaType }) => {
  if (effectivePlan === 'platinum') {
    if (mediaType === 'video') return 'Platinum plan does not support video uploads.';
    return 'Platinum plan allows only 2 images.';
  }

  if (effectivePlan === 'gold') {
    if (mediaType === 'video') return 'Gold plan does not support video uploads.';
    return 'Gold plan allows only 5 images.';
  }

  return 'Upload limit reached for your current plan.';
};

export const getClinicMediaLibrary = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.user?.id)
      .select('name email currentPlan subscriptionStatus planExpiresAt')
      .lean();

    if (!clinic) return res.status(404).json({ message: 'Clinic not found' });

    const mediaRecords = await DoctorMedia.find({
      clinicId: clinic._id,
      uploaderRole: 'clinic',
      deletedAt: null
    })
      .sort({ createdAt: -1 })
      .lean();

    const usage = getUsageSummary(mediaRecords);
    const effectivePlan = resolveEffectiveClinicPlan(clinic);
    const limits = getPlanLimits(effectivePlan);

    return res.status(200).json({
      media: mediaRecords.map(mapClinicMediaRecord),
      usage,
      policy: {
        currentPlan: effectivePlan,
        limits
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Could not fetch clinic media', error: err.message });
  }
};

export const uploadClinicMedia = async (req, res) => {
  let uploadedAsset = null;
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please select an image or video file to upload' });
    }

    const clinic = await Clinic.findById(req.user?.id).select('name email currentPlan subscriptionStatus planExpiresAt');

    if (!clinic) return res.status(404).json({ message: 'Clinic not found' });

    const mediaType = getMediaTypeFromMime(req.file?.mimetype);
    if (!mediaType) {
      return res.status(400).json({ message: 'Unsupported file type. Please upload an image or video.' });
    }

    const mediaRecords = await DoctorMedia.find({
      clinicId: clinic._id,
      uploaderRole: 'clinic',
      deletedAt: null
    })
      .select('mediaType moderationStatus')
      .lean();

    const usage = getUsageSummary(mediaRecords);
    const effectivePlan = resolveEffectiveClinicPlan(clinic);
    const limits = getPlanLimits(effectivePlan);

    if (isLimitReached({ limits, mediaType, usage })) {
      return res.status(403).json({
        message: getLimitErrorMessage({ effectivePlan, mediaType }),
        usage,
        policy: {
          currentPlan: effectivePlan,
          limits
        }
      });
    }

    uploadedAsset = await uploadClinicMediaToCloudinary(req.file);

    const created = await DoctorMedia.create({
      clinicId: clinic._id,
      clinicName: String(clinic.name || '').trim(),
      clinicEmail: String(clinic.email || '').trim().toLowerCase(),
      uploaderRole: 'clinic',
      mediaType,
      asset: uploadedAsset,
      moderationStatus: 'pending'
    });

    return res.status(201).json({
      message: 'Media uploaded successfully and sent for admin review',
      media: mapClinicMediaRecord(created)
    });
  } catch (err) {
    if (uploadedAsset?.publicId) {
      await deleteFromCloudinary(uploadedAsset.publicId, uploadedAsset.resourceType || 'image').catch(() => {});
    }
    return res.status(500).json({ message: 'Could not upload media', error: err.message });
  }
};

export const deleteClinicMedia = async (req, res) => {
  try {
    const mediaId = String(req.params?.mediaId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(mediaId)) {
      return res.status(400).json({ message: 'Invalid media id' });
    }

    const record = await DoctorMedia.findOne({
      _id: mediaId,
      clinicId: req.user?.id,
      uploaderRole: 'clinic',
      deletedAt: null
    });

    if (!record) return res.status(404).json({ message: 'Media not found' });

    if (record?.asset?.publicId) {
      await deleteFromCloudinary(record.asset.publicId, record.asset.resourceType || 'image').catch(() => {});
    }

    record.deletedAt = new Date();
    await record.save();

    return res.status(200).json({ message: 'Media deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Could not delete media', error: err.message });
  }
};

