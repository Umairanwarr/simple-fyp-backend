import {
  Appointment,
  Doctor,
  getNotificationSortTimestamp,
  getUnreadNotificationsCount,
  mapDoctorNotificationFromAppointment,
  mapDoctorNotificationFromMediaModeration
} from './shared.js';
import { DoctorMedia } from '../../../models/DoctorMedia.js';
import { DoctorSubscriptionNotification } from '../../../models/DoctorSubscriptionNotification.js';
import { DoctorLivestreamNotification } from '../../../models/DoctorLivestreamNotification.js';
import ChatMessage from '../../../models/ChatMessage.js';

export const getDoctorNotifications = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user?.id)
      .select('notificationsSeenAt')
      .lean();

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const [appointments, mediaRecords, subscriptionNotifications, livestreamNotifications, unreadChats] = await Promise.all([
      Appointment.find({
        doctorId: req.user?.id,
        paymentStatus: 'succeeded',
        bookingStatus: {
          $in: ['confirmed', 'cancelled']
        }
      })
        .select(
          'patientName appointmentDate fromTime toTime bookingStatus paymentStatus paidAt cancelledAt cancelledByRole refundStatus refundAmountInRupees createdAt updatedAt'
        )
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(40)
        .lean(),
      DoctorMedia.find({
        doctorId: req.user?.id,
        deletedAt: null,
        moderationStatus: {
          $in: ['approved', 'rejected']
        }
      })
        .select('mediaType moderationStatus moderationNote reviewedAt createdAt updatedAt')
        .sort({ reviewedAt: -1, updatedAt: -1, createdAt: -1 })
        .limit(40)
        .lean(),
      DoctorSubscriptionNotification.find({
        doctorId: req.user?.id
      })
        .select('eventType title message createdAt')
        .sort({ createdAt: -1 })
        .limit(40)
        .lean(),
      DoctorLivestreamNotification.find({
        doctorId: req.user?.id
      })
        .select('eventType streamTitle reason createdAt')
        .sort({ createdAt: -1 })
        .limit(40)
        .lean(),
      ChatMessage.find({
        to: req.user?.id,
        readAt: null
      })
        .populate('from', 'firstName lastName fullName')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean()
    ]);

    const appointmentNotifications = appointments
      .map((appointment) => mapDoctorNotificationFromAppointment(appointment))
      .filter(Boolean);
    const mediaNotifications = mediaRecords
      .map((mediaRecord) => mapDoctorNotificationFromMediaModeration(mediaRecord))
      .filter(Boolean)
      .sort((firstNotification, secondNotification) => {
        return getNotificationSortTimestamp(secondNotification) - getNotificationSortTimestamp(firstNotification);
      });
    const subscriptionEventNotifications = subscriptionNotifications
      .map((subscriptionNotification) => {
        if (!subscriptionNotification) {
          return null;
        }

        return {
          id: String(subscriptionNotification._id || ''),
          type: String(subscriptionNotification.eventType || '').trim() || 'plan_updated',
          title: String(subscriptionNotification.title || '').trim() || 'Subscription update',
          message: String(subscriptionNotification.message || '').trim() || 'Your subscription has changed.',
          createdAt: subscriptionNotification.createdAt || null
        };
      })
      .filter(Boolean);

    const livestreamEventNotifications = livestreamNotifications
      .map((notif) => {
        if (!notif) return null;
        return {
          id: String(notif._id),
          type: 'livestream_terminated',
          title: 'Live Stream Terminated',
          message: `Your stream "${notif.streamTitle}" was terminated by an Admin. Reason: ${notif.reason}`,
          createdAt: notif.createdAt
        };
      })
      .filter(Boolean);

    const chatNotifications = unreadChats.map(chat => {
      const fromDoc = chat.from || {};
      const senderName = chat.fromModel === 'Doctor' ? fromDoc.fullName : `${fromDoc.firstName || ''} ${fromDoc.lastName || ''}`.trim();
      return {
        id: String(chat._id),
        type: 'chat_message',
        title: `New message from ${senderName || 'Someone'}`,
        message: chat.content,
        createdAt: chat.createdAt
      };
    });

    const notifications = [...appointmentNotifications, ...mediaNotifications, ...subscriptionEventNotifications, ...livestreamEventNotifications, ...chatNotifications]
      .sort((firstNotification, secondNotification) => {
        return getNotificationSortTimestamp(secondNotification) - getNotificationSortTimestamp(firstNotification);
      })
      .slice(0, 80);

    return res.status(200).json({
      notifications,
      unreadCount: getUnreadNotificationsCount(notifications, doctor.notificationsSeenAt)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch doctor notifications', error: error.message });
  }
};

export const markDoctorNotificationsAsRead = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user?.id);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    doctor.notificationsSeenAt = new Date();
    await doctor.save();

    return res.status(200).json({ message: 'Notifications marked as read' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not mark notifications as read', error: error.message });
  }
};
