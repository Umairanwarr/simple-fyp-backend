import {
  Appointment,
  Doctor,
  getNotificationSortTimestamp,
  getUnreadNotificationsCount,
  mapDoctorNotificationFromAppointment
} from './shared.js';

export const getDoctorNotifications = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user?.id)
      .select('notificationsSeenAt')
      .lean();

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const appointments = await Appointment.find({
      doctorId: req.user?.id,
      paymentStatus: 'succeeded',
      bookingStatus: {
        $in: ['confirmed', 'cancelled']
      }
    })
      .select('patientName appointmentDate fromTime toTime bookingStatus paymentStatus paidAt cancelledAt createdAt updatedAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(40)
      .lean();

    const notifications = appointments
      .map((appointment) => mapDoctorNotificationFromAppointment(appointment))
      .filter(Boolean)
      .sort((firstNotification, secondNotification) => {
        return getNotificationSortTimestamp(secondNotification) - getNotificationSortTimestamp(firstNotification);
      });

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
