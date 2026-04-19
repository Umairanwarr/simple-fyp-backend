import { MedicalStore } from '../../../models/MedicalStore.js';
import { STRIPE_CURRENCY, getStripeClient } from '../../../services/stripeService.js';

export {
  MedicalStore,
  STRIPE_CURRENCY,
  getStripeClient
};

export const mapMedicalStoreSessionPayload = (storeRecord) => {
  const normalizedCurrentPlan = ['platinum', 'gold', 'diamond'].includes(String(storeRecord?.currentPlan || '').trim().toLowerCase())
    ? String(storeRecord.currentPlan).trim().toLowerCase()
    : 'platinum';
  const normalizedSubscriptionStatus = ['active', 'cancelled', 'expired'].includes(String(storeRecord?.subscriptionStatus || '').trim().toLowerCase())
    ? String(storeRecord.subscriptionStatus).trim().toLowerCase()
    : 'active';
  const parsedPlanExpiryDate = storeRecord?.planExpiresAt ? new Date(storeRecord.planExpiresAt) : null;
  const hasActivePaidPlan = normalizedCurrentPlan !== 'platinum'
    && normalizedSubscriptionStatus === 'active'
    && parsedPlanExpiryDate
    && !Number.isNaN(parsedPlanExpiryDate.getTime())
    && parsedPlanExpiryDate.getTime() > Date.now();
  
  const effectivePlan = hasActivePaidPlan ? normalizedCurrentPlan : 'platinum';
  const effectiveStatus = effectivePlan === 'platinum'
    ? (normalizedCurrentPlan === 'platinum' ? 'active' : 'expired')
    : normalizedSubscriptionStatus;

  return {
    id: storeRecord._id,
    name: storeRecord.name,
    email: storeRecord.email,
    phone: String(storeRecord.phone || '').trim(),
    address: String(storeRecord.address || '').trim(),
    licenseNumber: String(storeRecord.licenseNumber || '').trim(),
    operatingHours: String(storeRecord.operatingHours || '').trim(),
    bio: String(storeRecord.bio || '').trim(),
    role: storeRecord.role,
    applicationStatus: storeRecord.applicationStatus,
    avatarUrl: String(storeRecord?.avatarDocument?.url || '').trim(),
    currentPlan: effectivePlan,
    subscriptionStatus: effectiveStatus,
    planExpiresAt: effectivePlan === 'platinum' ? null : storeRecord?.planExpiresAt || null
  };
};

export const getNotificationSortTimestamp = (notificationRecord) => {
  if (!notificationRecord || !notificationRecord.createdAt) return 0;
  return new Date(notificationRecord.createdAt).getTime();
};

export const getUnreadNotificationsCount = (notifications, seenAt) => {
  if (!Array.isArray(notifications)) return 0;
  const seenAtTimestamp = seenAt ? new Date(seenAt).getTime() : 0;
  return notifications.filter((notification) => {
    return getNotificationSortTimestamp(notification) > seenAtTimestamp;
  }).length;
};

export const mapStoreNotificationFromMediaModeration = (mediaRecord) => {
  const status = String(mediaRecord?.moderationStatus || '').trim().toLowerCase();
  const isApproved = status === 'approved';
  
  return {
    id: String(mediaRecord._id || ''),
    type: isApproved ? 'media_approved' : 'media_rejected',
    title: isApproved ? 'Media Approved' : 'Media Rejected',
    message: isApproved 
      ? `Your media file "${mediaRecord.asset?.originalName || 'file'}" has been approved.` 
      : `Your media file "${mediaRecord.asset?.originalName || 'file'}" was rejected. ${mediaRecord.moderationNote ? `Reason: ${mediaRecord.moderationNote}` : ''}`,
    createdAt: mediaRecord.reviewedAt || mediaRecord.updatedAt || mediaRecord.createdAt
  };
};
