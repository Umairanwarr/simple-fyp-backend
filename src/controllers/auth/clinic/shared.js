import { Clinic } from '../../../models/Clinic.js';

export const toDateTimestamp = (dateValue) => {
  const parsedDate = dateValue ? new Date(dateValue) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) return 0;
  return parsedDate.getTime();
};

export const getNotificationSortTimestamp = (notificationRecord) => {
  return toDateTimestamp(notificationRecord?.createdAt);
};

export const getUnreadNotificationsCount = (notifications, seenAt) => {
  const seenAtTimestamp = toDateTimestamp(seenAt);
  if (seenAtTimestamp <= 0) return notifications.length;
  return notifications.filter((notification) => {
    return getNotificationSortTimestamp(notification) > seenAtTimestamp;
  }).length;
};

export const mapClinicNotificationFromMediaModeration = (mediaRecord) => {
  const moderationStatus = String(mediaRecord?.moderationStatus || '').trim().toLowerCase();
  if (!['approved', 'rejected'].includes(moderationStatus)) return null;

  const mediaType = String(mediaRecord?.mediaType || '').trim().toLowerCase() === 'video' ? 'video' : 'image';
  const moderationNote = String(mediaRecord?.moderationNote || '').trim();
  const createdAt = mediaRecord?.reviewedAt || mediaRecord?.updatedAt || mediaRecord?.createdAt;
  const isApproved = moderationStatus === 'approved';

  return {
    id: `${String(mediaRecord?._id || '')}:media-${moderationStatus}`,
    mediaId: String(mediaRecord?._id || ''),
    type: isApproved ? 'media_approved' : 'media_rejected',
    title: isApproved ? 'Media Approved' : 'Media Rejected',
    message: isApproved
      ? `Your ${mediaType} was approved and is now visible on your profile.`
      : `Your ${mediaType} was rejected by admin.${moderationNote ? ` Reason: ${moderationNote}` : ''}`,
    createdAt: createdAt ? new Date(createdAt).toISOString() : null
  };
};
