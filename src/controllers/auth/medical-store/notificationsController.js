import { MedicalStore } from '../../../models/MedicalStore.js';
import { DoctorMedia } from '../../../models/DoctorMedia.js';
import { MedicalStoreSubscriptionNotification } from '../../../models/MedicalStoreSubscriptionNotification.js';
import { StoreOrderNotification } from '../../../models/StoreOrderNotification.js';
import { 
  getNotificationSortTimestamp, 
  getUnreadNotificationsCount, 
  mapStoreNotificationFromMediaModeration 
} from './shared.js';

export const getMedicalStoreNotifications = async (req, res) => {
  try {
    const store = await MedicalStore.findById(req.user?.id)
      .select('notificationsSeenAt')
      .lean();

    if (!store) {
      return res.status(404).json({ message: 'Medical store not found' });
    }

    const [mediaRecords, subscriptionNotifications, orderNotifications] = await Promise.all([
      DoctorMedia.find({
        storeId: req.user.id,
        uploaderRole: 'medical-store',
        moderationStatus: { $in: ['approved', 'rejected'] },
        deletedAt: null
      })
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean(),
      MedicalStoreSubscriptionNotification.find({
        storeId: req.user.id
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      StoreOrderNotification.find({
        storeId: req.user.id,
        eventType: 'order_placed'
      })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean()
    ]);

    const mediaNotifications = mediaRecords.map(mapStoreNotificationFromMediaModeration);
    
    const subscriptionEventNotifications = subscriptionNotifications.map(n => ({
      id: String(n._id || ''),
      type: String(n.eventType || 'plan_updated'),
      title: String(n.title || 'Subscription Update'),
      message: String(n.message || 'Your plan has been updated.'),
      createdAt: n.createdAt
    }));

    const storeOrderNotifs = orderNotifications.map(n => ({
      id: String(n._id),
      type: 'order_placed',
      title: String(n.title || 'New Order Received'),
      message: String(n.message || 'A new order has been placed.'),
      createdAt: n.createdAt
    }));

    const notifications = [...mediaNotifications, ...subscriptionEventNotifications, ...storeOrderNotifs]
      .sort((a, b) => getNotificationSortTimestamp(b) - getNotificationSortTimestamp(a));

    return res.status(200).json({
      notifications,
      unreadCount: getUnreadNotificationsCount(notifications, store.notificationsSeenAt)
    });
  } catch (err) {
    return res.status(500).json({ message: 'Could not fetch notifications', error: err.message });
  }
};

export const markMedicalStoreNotificationsAsRead = async (req, res) => {
  try {
    await MedicalStore.findByIdAndUpdate(req.user.id, {
      $set: { notificationsSeenAt: new Date() }
    });
    return res.status(200).json({ message: 'Notifications marked as read' });
  } catch (err) {
    return res.status(500).json({ message: 'Could not update notifications status', error: err.message });
  }
};
