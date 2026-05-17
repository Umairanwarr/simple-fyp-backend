import { Clinic } from '../../../models/Clinic.js';
import { ClinicDoctorAppointment } from '../../../models/ClinicDoctorAppointment.js';
import ClinicChatMessage from '../../../models/ClinicChatMessage.js';
import { DoctorMedia } from '../../../models/DoctorMedia.js';
import { decryptChatText } from '../../../utils/chatCrypto.js';
import {
  getNotificationSortTimestamp,
  getUnreadNotificationsCount,
  mapClinicNotificationFromMediaModeration
} from './shared.js';

export const getClinicNotifications = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.user?.id)
      .select('notificationsSeenAt reviews name')
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

    const appointmentRecords = await ClinicDoctorAppointment.find({
      clinicId: req.user?.id,
      paymentStatus: 'succeeded',
      bookingStatus: { $in: ['confirmed', 'cancelled'] }
    })
      .select('patientName doctorName providerType serviceName appointmentDate fromTime toTime paidAt cancelledAt cancelledByRole refundStatus refundAmountInRupees bookingStatus createdAt updatedAt')
      .sort({ updatedAt: -1, paidAt: -1, createdAt: -1 })
      .limit(40)
      .lean();

    const appointmentNotifications = appointmentRecords.map((appointmentRecord) => {
      const isCancelled = String(appointmentRecord?.bookingStatus || '').trim() === 'cancelled';
      const patientName = String(appointmentRecord?.patientName || 'A patient').trim();
      const isServiceAppointment = String(appointmentRecord?.providerType || '').trim().toLowerCase() === 'service';
      const providerName = isServiceAppointment
        ? String(appointmentRecord?.serviceName || appointmentRecord?.doctorName || 'Service').trim()
        : String(appointmentRecord?.doctorName || 'Doctor').trim();
      const date = String(appointmentRecord?.appointmentDate || '').trim();
      const time = `${String(appointmentRecord?.fromTime || '').trim()} - ${String(appointmentRecord?.toTime || '').trim()}`;
      const refundAmount = Math.max(0, Math.trunc(Number(appointmentRecord?.refundAmountInRupees || 0)));
      const refundText = refundAmount > 0
        ? ` Refund: Rs ${refundAmount.toLocaleString('en-PK')}.`
        : '';

      return {
        id: `${String(appointmentRecord?._id || '')}:${isCancelled ? 'clinic-appointment-cancelled' : 'clinic-appointment-booked'}`,
        type: isCancelled ? 'clinic_appointment_cancelled' : 'clinic_appointment_booked',
        title: isCancelled ? 'Appointment Cancelled' : 'New Appointment Booked',
        message: isCancelled
          ? `${patientName}'s appointment with ${isServiceAppointment ? providerName : `Dr. ${providerName}`} on ${date} (${time}) was cancelled.${refundText}`
          : `${patientName} booked ${isServiceAppointment ? providerName : `Dr. ${providerName}`} for ${date} (${time}).`,
        createdAt: appointmentRecord?.cancelledAt || appointmentRecord?.paidAt || appointmentRecord?.createdAt || appointmentRecord?.updatedAt || null
      };
    });

    const reviewNotifications = (Array.isArray(clinic.reviews) ? clinic.reviews : []).map((review) => ({
      id: `${String(review?._id || '')}:clinic-review`,
      type: 'clinic_review_submitted',
      title: 'New Patient Review',
      message: `${String(review?.patientName || 'A patient').trim()} submitted a ${Math.max(1, Math.min(5, Math.trunc(Number(review?.rating || 0)) || 0))}-star review.`,
      createdAt: review?.createdAt || null
    }));

    const unreadClinicChats = await ClinicChatMessage.find({
      to: req.user?.id,
      readAt: null
    })
      .populate('from', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const clinicChatNotifications = unreadClinicChats.map((chat) => {
      const fromDoc = chat.from || {};
      const senderName = `${String(fromDoc.firstName || '').trim()} ${String(fromDoc.lastName || '').trim()}`.trim() || 'Patient';

      return {
        id: `clinic-chat:${String(chat?._id || '')}`,
        type: 'clinic_chat_message',
        title: `New message from ${senderName}`,
        message: decryptChatText(chat?.content) || 'You received a new media message.',
        createdAt: chat?.createdAt || null
      };
    });

    const notifications = [...appointmentNotifications, ...reviewNotifications, ...clinicChatNotifications, ...mediaNotifications]
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
