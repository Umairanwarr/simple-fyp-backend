import mongoose from 'mongoose';
import { DoctorMedia } from '../../../models/DoctorMedia.js';
import { deleteFromCloudinary, uploadDoctorMediaToCloudinary } from '../../../services/cloudinaryService.js';
import { Doctor } from './shared.js';

const ACTIVE_MEDIA_STATUSES = ['pending', 'approved'];

const MEDIA_PLAN_LIMITS = {
  platinum: {
    maxImages: 2,
    maxVideos: 0
  },
  gold: {
    maxImages: 5,
    maxVideos: 1
  },
  diamond: {
    maxImages: null,
    maxVideos: null
  }
};

const normalizePlan = (planValue) => {
  const normalizedPlan = String(planValue || '').trim().toLowerCase();

  if (['platinum', 'gold', 'diamond'].includes(normalizedPlan)) {
    return normalizedPlan;
  }

  return 'platinum';
};

const normalizeSubscriptionStatus = (statusValue) => {
  const normalizedStatus = String(statusValue || '').trim().toLowerCase();

  if (['active', 'cancelled', 'expired'].includes(normalizedStatus)) {
    return normalizedStatus;
  }

  return 'active';
};

const toDateTimestamp = (dateValue) => {
  const parsedDate = dateValue ? new Date(dateValue) : null;

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return 0;
  }

  return parsedDate.getTime();
};

const resolveEffectiveDoctorPlan = (doctorRecord, now = new Date()) => {
  const normalizedPlan = normalizePlan(doctorRecord?.currentPlan);
  const normalizedStatus = normalizeSubscriptionStatus(doctorRecord?.subscriptionStatus);
  const planExpiryTimestamp = toDateTimestamp(doctorRecord?.planExpiresAt);

  if (
    ['gold', 'diamond'].includes(normalizedPlan)
    && normalizedStatus === 'active'
    && planExpiryTimestamp > now.getTime()
  ) {
    return normalizedPlan;
  }

  return 'platinum';
};

const getPlanLimits = (planKey) => {
  return MEDIA_PLAN_LIMITS[normalizePlan(planKey)] || MEDIA_PLAN_LIMITS.platinum;
};

const toCountValue = (value) => {
  return Math.max(0, Math.trunc(Number(value || 0)));
};

const mapMediaUsage = ({ imageCount = 0, videoCount = 0 }) => {
  return {
    imageCount: toCountValue(imageCount),
    videoCount: toCountValue(videoCount)
  };
};

const mapDoctorMediaRecord = (mediaRecord) => {
  return {
    id: String(mediaRecord?._id || ''),
    mediaType: String(mediaRecord?.mediaType || '').trim().toLowerCase() === 'video' ? 'video' : 'image',
    url: String(mediaRecord?.asset?.url || '').trim(),
    originalName: String(mediaRecord?.asset?.originalName || '').trim() || 'media-file',
    format: String(mediaRecord?.asset?.format || '').trim() || null,
    bytes: toCountValue(mediaRecord?.asset?.bytes),
    moderationStatus: String(mediaRecord?.moderationStatus || '').trim().toLowerCase() || 'pending',
    moderationNote: String(mediaRecord?.moderationNote || '').trim(),
    reviewedAt: mediaRecord?.reviewedAt || null,
    uploadedAt: mediaRecord?.createdAt || null
  };
};

const getUsageForDoctor = async (doctorId) => {
  const normalizedDoctorId = String(doctorId || '').trim();

  if (!mongoose.Types.ObjectId.isValid(normalizedDoctorId)) {
    return mapMediaUsage({});
  }

  const [imageCount, videoCount] = await Promise.all([
    DoctorMedia.countDocuments({
      doctorId: normalizedDoctorId,
      deletedAt: null,
      mediaType: 'image',
      moderationStatus: {
        $in: ACTIVE_MEDIA_STATUSES
      }
    }),
    DoctorMedia.countDocuments({
      doctorId: normalizedDoctorId,
      deletedAt: null,
      mediaType: 'video',
      moderationStatus: {
        $in: ACTIVE_MEDIA_STATUSES
      }
    })
  ]);

  return mapMediaUsage({ imageCount, videoCount });
};

const isLimitReached = ({ planLimits, mediaType, usage }) => {
  if (mediaType === 'image') {
    if (planLimits.maxImages === null) {
      return false;
    }

    return usage.imageCount >= planLimits.maxImages;
  }

  if (planLimits.maxVideos === null) {
    return false;
  }

  return usage.videoCount >= planLimits.maxVideos;
};

const getUpgradeMessage = ({ effectivePlan, mediaType }) => {
  if (effectivePlan === 'platinum') {
    if (mediaType === 'video') {
      return 'Platinum plan does not support video uploads. Upgrade to Gold or Diamond.';
    }

    return 'Platinum plan allows only 2 images. Upgrade to Gold or Diamond for more uploads.';
  }

  if (effectivePlan === 'gold') {
    if (mediaType === 'video') {
      return 'Gold plan allows only 1 video upload. Upgrade to Diamond for more video uploads.';
    }

    return 'Gold plan allows only 5 images. Upgrade to Diamond for more image uploads.';
  }

  return 'Upload limit reached for your plan.';
};

const getMediaTypeFromMime = (mimeTypeValue) => {
  const mimeType = String(mimeTypeValue || '').trim().toLowerCase();

  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  return '';
};

const buildMediaPolicyPayload = ({ effectivePlan, usage }) => {
  const planLimits = getPlanLimits(effectivePlan);

  return {
    currentPlan: effectivePlan,
    limits: {
      maxImages: planLimits.maxImages,
      maxVideos: planLimits.maxVideos
    },
    usage: mapMediaUsage(usage)
  };
};

export const getDoctorMediaLibrary = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user?.id)
      .select('fullName email currentPlan subscriptionStatus planExpiresAt planActivatedAt lastPlanPaymentAt')
      .lean();

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const effectivePlan = resolveEffectiveDoctorPlan(doctor);
    const usage = await getUsageForDoctor(doctor._id);

    const mediaRecords = await DoctorMedia.find({
      doctorId: doctor._id,
      deletedAt: null
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      media: mediaRecords.map((mediaRecord) => mapDoctorMediaRecord(mediaRecord)),
      policy: buildMediaPolicyPayload({
        effectivePlan,
        usage
      })
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not fetch doctor media',
      error: error.message
    });
  }
};

export const uploadDoctorMedia = async (req, res) => {
  let uploadedAsset = null;

  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image or video file' });
    }

    const doctor = await Doctor.findById(req.user?.id)
      .select('fullName email currentPlan subscriptionStatus planExpiresAt planActivatedAt lastPlanPaymentAt')
      .lean();

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const mediaType = getMediaTypeFromMime(req.file?.mimetype);

    if (!mediaType) {
      return res.status(400).json({ message: 'Unsupported media type' });
    }

    const effectivePlan = resolveEffectiveDoctorPlan(doctor);
    const usage = await getUsageForDoctor(doctor._id);
    const planLimits = getPlanLimits(effectivePlan);

    if (isLimitReached({ planLimits, mediaType, usage })) {
      return res.status(403).json({
        message: getUpgradeMessage({
          effectivePlan,
          mediaType
        }),
        policy: buildMediaPolicyPayload({
          effectivePlan,
          usage
        })
      });
    }

    uploadedAsset = await uploadDoctorMediaToCloudinary(req.file);

    const createdMedia = await DoctorMedia.create({
      doctorId: doctor._id,
      doctorName: String(doctor.fullName || '').trim() || 'Doctor',
      doctorEmail: String(doctor.email || '').trim().toLowerCase(),
      mediaType,
      asset: uploadedAsset,
      moderationStatus: 'pending'
    });

    const nextUsage = {
      imageCount: usage.imageCount + (mediaType === 'image' ? 1 : 0),
      videoCount: usage.videoCount + (mediaType === 'video' ? 1 : 0)
    };

    return res.status(201).json({
      message: 'Media uploaded successfully and sent for admin moderation',
      media: mapDoctorMediaRecord(createdMedia),
      policy: buildMediaPolicyPayload({
        effectivePlan,
        usage: nextUsage
      })
    });
  } catch (error) {
    if (uploadedAsset?.publicId) {
      try {
        await deleteFromCloudinary(uploadedAsset.publicId, uploadedAsset.resourceType || 'image');
      } catch (deleteError) {
        // Ignore cleanup failures to preserve original error response.
      }
    }

    return res.status(500).json({
      message: 'Could not upload doctor media',
      error: error.message
    });
  }
};

export const deleteDoctorMedia = async (req, res) => {
  try {
    const mediaId = String(req.params?.mediaId || '').trim();

    if (!mongoose.Types.ObjectId.isValid(mediaId)) {
      return res.status(400).json({ message: 'Invalid media id' });
    }

    const mediaRecord = await DoctorMedia.findOne({
      _id: mediaId,
      doctorId: req.user?.id,
      deletedAt: null
    });

    if (!mediaRecord) {
      return res.status(404).json({ message: 'Media not found' });
    }

    if (mediaRecord?.asset?.publicId) {
      try {
        await deleteFromCloudinary(mediaRecord.asset.publicId, mediaRecord.asset.resourceType || 'image');
      } catch (error) {
        // Continue deleting from app state even if cloud asset has already been removed.
      }
    }

    mediaRecord.deletedAt = new Date();
    mediaRecord.deletedByDoctor = true;
    await mediaRecord.save();

    const doctor = await Doctor.findById(req.user?.id)
      .select('currentPlan subscriptionStatus planExpiresAt')
      .lean();
    const effectivePlan = resolveEffectiveDoctorPlan(doctor || {});
    const usage = await getUsageForDoctor(req.user?.id);

    return res.status(200).json({
      message: 'Media deleted successfully',
      policy: buildMediaPolicyPayload({
        effectivePlan,
        usage
      })
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not delete media',
      error: error.message
    });
  }
};
