import { Clinic } from '../../../models/Clinic.js';
import { DoctorMedia } from '../../../models/DoctorMedia.js';
import {
  getNotificationSortTimestamp,
  getUnreadNotificationsCount,
  mapClinicNotificationFromMediaModeration
} from './shared.js';

export const getClinicNotifications = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.user?.id)
      .select('notificationsSeenAt')
      .lean();

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    const mediaRecords = await DoctorMedia.find({
      clinicId: req.user?.id,
      uploaderRole: 'clinic',
      deletedAt: null,
      moderationStatus: {
        $in: ['approved', 'rejected']
      }
    })
      .select('mediaType moderationStatus moderationNote reviewedAt createdAt updatedAt')
      .sort({ reviewedAt: -1, updatedAt: -1, createdAt: -1 })
      .limit(40)
      .lean();

    const mediaNotifications = mediaRecords
      .map((mediaRecord) => mapClinicNotificationFromMediaModeration(mediaRecord))
      .filter(Boolean);

    const notifications = [...mediaNotifications]
      .sort((firstNotification, secondNotification) => {
        return getNotificationSortTimestamp(secondNotification) - getNotificationSortTimestamp(firstNotification);
      })
      .slice(0, 80);

    return res.status(200).json({
      notifications,
      unreadCount: getUnreadNotificationsCount(notifications, clinic.notificationsSeenAt)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch clinic notifications', error: error.message });
  }
};

export const markClinicNotificationsAsRead = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.user?.id);

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    clinic.notificationsSeenAt = new Date();
    await clinic.save();

    return res.status(200).json({ message: 'Notifications marked as read' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not mark notifications as read', error: error.message });
  }
};
