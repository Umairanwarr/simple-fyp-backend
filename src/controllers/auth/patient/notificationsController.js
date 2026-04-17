import {
  Appointment,
  Patient,
  getNotificationSortTimestamp,
  getUnreadNotificationsCount,
  mapPatientNotificationFromAppointment
} from './shared.js';
import ChatMessage from '../../../models/ChatMessage.js';
import Prescription from '../../../models/Prescription.js';
import { StoreOrderNotification } from '../../../models/StoreOrderNotification.js';

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

    // Prescription notifications — fetch recent prescriptions for this patient
    const recentPrescriptions = await Prescription.find({ patientId: req.user?.id })
      .populate('doctorId', 'fullName')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const prescriptionNotifications = recentPrescriptions.map(rx => {
      const doctorName = String(rx.doctorId?.fullName || 'Your Doctor').trim();
      return {
        id: `rx:${String(rx._id)}`,
        type: 'prescription_received',
        title: 'New Prescription Received',
        message: `Dr. ${doctorName} has sent you a new prescription. Tap to view it.`,
        createdAt: rx.createdAt
      };
    });

    // Store order notifications (accepted / declined)
    const storeOrderNotifs = await StoreOrderNotification.find({
      patientId: req.user?.id,
      eventType: { $in: ['order_accepted', 'order_declined'] }
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const storeOrderNotifications = storeOrderNotifs.map(n => ({
      id: String(n._id),
      type: n.eventType,
      title: String(n.title || 'Order Update'),
      message: String(n.message || ''),
      createdAt: n.createdAt
    }));

    const notifications = [
      ...appointments.map((appointment) => mapPatientNotificationFromAppointment(appointment)).filter(Boolean),
      ...chatNotifications,
      ...prescriptionNotifications,
      ...storeOrderNotifications
    ]
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
