import {
  Appointment,
  getAppointmentHistorySortTimestamp,
  getAppointmentLifecycleStatus,
  mapAppointmentForPatient
} from './shared.js';

export const getPatientAppointmentHistory = async (req, res) => {
  try {
    const appointments = await Appointment.find({
      patientId: req.user?.id,
      paymentStatus: 'succeeded',
      bookingStatus: {
        $in: ['confirmed', 'cancelled']
      }
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const now = new Date();

    const historyAppointments = appointments
      .map((appointment) => {
        const lifecycleStatus = getAppointmentLifecycleStatus(appointment, now);

        if (lifecycleStatus !== 'cancelled' && lifecycleStatus !== 'completed') {
          return null;
        }

        return {
          appointment,
          lifecycleStatus,
          sortTimestamp: getAppointmentHistorySortTimestamp(appointment, lifecycleStatus)
        };
      })
      .filter(Boolean)
      .sort((firstEntry, secondEntry) => secondEntry.sortTimestamp - firstEntry.sortTimestamp)
      .map((appointmentEntry) => mapAppointmentForPatient(appointmentEntry.appointment, {
        lifecycleStatus: appointmentEntry.lifecycleStatus
      }));

    return res.status(200).json({
      appointments: historyAppointments
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch patient appointment history', error: error.message });
  }
};
