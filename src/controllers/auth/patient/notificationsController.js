import {
  Appointment,
  Patient,
  getNotificationSortTimestamp,
  getUnreadNotificationsCount,
  mapPatientNotificationFromAppointment
} from './shared.js';

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
      .select('doctorName appointmentDate fromTime toTime bookingStatus paymentStatus paidAt cancelledAt createdAt updatedAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(40)
      .lean();

    const notifications = appointments
      .map((appointment) => mapPatientNotificationFromAppointment(appointment))
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
