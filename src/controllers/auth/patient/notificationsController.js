import {
  Appointment,
  Patient,
  getNotificationSortTimestamp,
  getUnreadNotificationsCount,
  mapPatientNotificationFromAppointment
} from './shared.js';
import ChatMessage from '../../../models/ChatMessage.js';

export const getPatientNotifications = async (req, res) => {
  try {
    const patient = await Patient.findById(req.user?.id)
      .select('notificationsSeenAt')
      .lean();

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const appointments = await Appointment.find({
      patientId: req.user?.id,
      paymentStatus: 'succeeded',
      bookingStatus: {
        $in: ['confirmed', 'cancelled']
      }
    })
      .select(
        'doctorName appointmentDate fromTime toTime bookingStatus paymentStatus paidAt cancelledAt cancelledByRole refundStatus refundAmountInRupees rescheduledAt rescheduledByRole rescheduleReason previousAppointmentDate previousFromTime previousToTime createdAt updatedAt'
      )
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(40)
      .lean();

    const unreadChats = await ChatMessage.find({
      to: req.user?.id,
      readAt: null
    })
      .populate('from', 'firstName lastName fullName')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

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

    const notifications = [...appointments.map((appointment) => mapPatientNotificationFromAppointment(appointment)).filter(Boolean), ...chatNotifications]
      .filter(Boolean)
      .sort((firstNotification, secondNotification) => {
        return getNotificationSortTimestamp(secondNotification) - getNotificationSortTimestamp(firstNotification);
      });

    return res.status(200).json({
      notifications,
      unreadCount: getUnreadNotificationsCount(notifications, patient.notificationsSeenAt)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch patient notifications', error: error.message });
  }
};

export const markPatientNotificationsAsRead = async (req, res) => {
  try {
    const patient = await Patient.findById(req.user?.id);

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    patient.notificationsSeenAt = new Date();
    await patient.save();

    return res.status(200).json({ message: 'Notifications marked as read' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not mark notifications as read', error: error.message });
  }
};
