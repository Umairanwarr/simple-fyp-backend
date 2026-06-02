import {
  Appointment,
  getAppointmentHistorySortTimestamp,
  getAppointmentLifecycleStatus,
  mapAppointmentForPatient
} from './shared.js';
import { ClinicDoctorAppointment } from '../../../models/ClinicDoctorAppointment.js';

export const getPatientAppointmentHistory = async (req, res) => {
  try {
    const [appointments, clinicAppointments] = await Promise.all([
      Appointment.find({
        patientId: req.user?.id,
        paymentStatus: 'succeeded',
        bookingStatus: {
          $in: ['confirmed', 'cancelled']
        }
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean(),
      ClinicDoctorAppointment.find({
        patientId: req.user?.id,
        paymentStatus: 'succeeded',
        bookingStatus: {
          $in: ['confirmed', 'cancelled']
        }
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean()
    ]);

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

    const clinicHistoryAppointments = clinicAppointments
      .map((appointment) => {
        const lifecycleStatus = getAppointmentLifecycleStatus(appointment, now);
        if (lifecycleStatus !== 'cancelled' && lifecycleStatus !== 'completed') return null;
        return {
          id: String(appointment?._id || ''),
          type: 'clinic',
          status: lifecycleStatus === 'cancelled' ? 'Cancelled' : 'Completed',
          statusCode: lifecycleStatus,
          date: String(appointment?.appointmentDate || '').trim(),
          fromTime: String(appointment?.fromTime || '').trim(),
          toTime: String(appointment?.toTime || '').trim(),
          amountInRupees: Math.max(0, Math.trunc(Number(appointment?.amountInRupees || 0))),
          cancelledAt: appointment?.cancelledAt || null,
          completedAt: lifecycleStatus === 'completed' ? appointment?.updatedAt || appointment?.createdAt || null : null,
          bookedAt: appointment?.paidAt || appointment?.createdAt || null,
          doctor: {
            id: String(appointment?.doctorId || ''),
            name: String(appointment?.doctorName || '').trim() || 'Clinic Doctor',
            image: String(appointment?.doctorAvatarUrl || '').trim() || '/topdoc.svg',
            specialization: String(appointment?.doctorSpecialization || '').trim()
          }
        };
      })
      .filter(Boolean);

    return res.status(200).json({
      appointments: [...historyAppointments, ...clinicHistoryAppointments].sort((first, second) => {
        const firstKey = String(first?.cancelledAt || first?.completedAt || first?.bookedAt || '');
        const secondKey = String(second?.cancelledAt || second?.completedAt || second?.bookedAt || '');
        return secondKey.localeCompare(firstKey);
      })
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch patient appointment history', error: error.message });
  }
};
