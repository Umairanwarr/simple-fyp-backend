import {
  Appointment,
  Patient,
  getNotificationSortTimestamp,
  getUnreadNotificationsCount,
  mapPatientNotificationFromAppointment
} from './shared.js';
import ChatMessage from '../../../models/ChatMessage.js';
import ClinicChatMessage from '../../../models/ClinicChatMessage.js';
import { ClinicDoctorAppointment } from '../../../models/ClinicDoctorAppointment.js';
import Prescription from '../../../models/Prescription.js';
import { StoreOrderNotification } from '../../../models/StoreOrderNotification.js';
import { decryptChatText } from '../../../utils/chatCrypto.js';

const mapPatientReminderNotification = ({
  id,
  appointmentId,
  providerName,
  providerType = 'doctor',
  clinicName = '',
  appointmentDate,
  fromTime,
  toTime,
  reminderSentAt
}) => {
  if (!reminderSentAt) {
    return null;
  }

  const normalizedProviderType = String(providerType || '').trim().toLowerCase();
  const safeProviderName = String(providerName || '').trim() || (normalizedProviderType === 'service' ? 'Service' : 'Doctor');
  const safeClinicName = String(clinicName || '').trim();
  const providerLabel = normalizedProviderType === 'service' ? safeProviderName : `Dr. ${safeProviderName}`;
  const clinicSuffix = safeClinicName ? ` at ${safeClinicName}` : '';

  return {
    id,
    appointmentId,
    type: 'appointment_reminder',
    title: 'Appointment Reminder',
    message: `Your appointment with ${providerLabel}${clinicSuffix} starts in 5 minutes on ${appointmentDate} (${fromTime} - ${toTime}).`,
    createdAt: new Date(reminderSentAt).toISOString()
  };
};

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
        'doctorName appointmentDate fromTime toTime bookingStatus paymentStatus paidAt cancelledAt cancelledByRole refundStatus refundAmountInRupees rescheduledAt rescheduledByRole rescheduleReason previousAppointmentDate previousFromTime previousToTime reminderSentAt createdAt updatedAt'
      )
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(40)
      .lean();

    const clinicAppointments = await ClinicDoctorAppointment.find({
      patientId: req.user?.id,
      paymentStatus: 'succeeded',
      bookingStatus: {
        $in: ['confirmed', 'cancelled']
      }
    })
      .select('clinicName doctorName providerType serviceName appointmentDate fromTime toTime bookingStatus paymentStatus paidAt cancelledAt cancelledByRole refundStatus refundAmountInRupees reminderSentAt createdAt updatedAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(40)
      .lean();

    const clinicAppointmentNotifications = clinicAppointments.map((appointment) => {
      const isCancelled = String(appointment?.bookingStatus || '') === 'cancelled';
      const clinicName = String(appointment?.clinicName || 'Clinic').trim();
      const isServiceAppointment = String(appointment?.providerType || '').trim().toLowerCase() === 'service';
      const providerName = isServiceAppointment
        ? String(appointment?.serviceName || appointment?.doctorName || 'Service').trim()
        : String(appointment?.doctorName || 'Doctor').trim();
      const date = String(appointment?.appointmentDate || '').trim();
      const time = `${String(appointment?.fromTime || '').trim()} - ${String(appointment?.toTime || '').trim()}`;
      const refundAmount = Math.max(0, Math.trunc(Number(appointment?.refundAmountInRupees || 0)));
      const refundStatus = String(appointment?.refundStatus || '').trim().toLowerCase();
      const refundText = refundAmount > 0
        ? refundStatus === 'succeeded'
          ? ` Refund of Rs ${refundAmount.toLocaleString('en-PK')} has been processed.`
          : ` Refund of Rs ${refundAmount.toLocaleString('en-PK')} is being processed.`
        : '';

      return {
        id: `${String(appointment?._id || '')}:clinic-appointment`,
        type: isCancelled ? 'clinic_appointment_cancelled' : 'clinic_appointment_booked',
        title: isCancelled ? 'Clinic Appointment Cancelled' : 'Clinic Appointment Booked',
        message: isCancelled
          ? `Your appointment at ${clinicName} with ${isServiceAppointment ? providerName : `Dr. ${providerName}`} on ${date} (${time}) was cancelled.${refundText}`
          : `${clinicName} confirmed your appointment with ${isServiceAppointment ? providerName : `Dr. ${providerName}`} for ${date} (${time}).`,
        createdAt: appointment?.cancelledAt || appointment?.paidAt || appointment?.createdAt || appointment?.updatedAt || null
      };
    });

    const appointmentReminderNotifications = appointments.map((appointment) => {
      return mapPatientReminderNotification({
        id: `${String(appointment?._id || '')}:reminder`,
        appointmentId: String(appointment?._id || ''),
        providerName: appointment?.doctorName,
        providerType: 'doctor',
        appointmentDate: appointment?.appointmentDate,
        fromTime: appointment?.fromTime,
        toTime: appointment?.toTime,
        reminderSentAt: appointment?.reminderSentAt
      });
    });

    const clinicAppointmentReminderNotifications = clinicAppointments.map((appointment) => {
      const isServiceAppointment = String(appointment?.providerType || '').trim().toLowerCase() === 'service';
      const providerName = isServiceAppointment
        ? String(appointment?.serviceName || appointment?.doctorName || 'Service').trim()
        : String(appointment?.doctorName || 'Doctor').trim();

      return mapPatientReminderNotification({
        id: `${String(appointment?._id || '')}:clinic-reminder`,
        appointmentId: String(appointment?._id || ''),
        providerName,
        providerType: appointment?.providerType,
        clinicName: appointment?.clinicName,
        appointmentDate: appointment?.appointmentDate,
        fromTime: appointment?.fromTime,
        toTime: appointment?.toTime,
        reminderSentAt: appointment?.reminderSentAt
      });
    });

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
      const messageText = decryptChatText(chat.content);
      return {
        id: String(chat._id),
        type: 'chat_message',
        title: `New message from ${senderName || 'Someone'}`,
        message: messageText || 'You received a new media message.',
        createdAt: chat.createdAt
      };
    });

    const unreadClinicChats = await ClinicChatMessage.find({
      to: req.user?.id,
      readAt: null
    })
      .populate('from', 'name')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const clinicChatNotifications = unreadClinicChats.map((chat) => {
      const fromDoc = chat.from || {};
      const senderName = String(fromDoc?.name || '').trim() || 'Clinic';
      return {
        id: `clinic-chat:${String(chat?._id || '')}`,
        type: 'clinic_chat_message',
        title: `New message from ${senderName}`,
        message: decryptChatText(chat?.content) || 'You received a new media message.',
        createdAt: chat?.createdAt || null
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
      ...clinicAppointmentNotifications,
      ...appointmentReminderNotifications,
      ...clinicAppointmentReminderNotifications,
      ...chatNotifications,
      ...clinicChatNotifications,
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
