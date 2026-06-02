import { Appointment } from '../models/Appointment.js';
import { ClinicDoctorAppointment } from '../models/ClinicDoctorAppointment.js';
import { Patient } from '../models/Patient.js';
import { getDateTimeInTimeZone } from '../utils/slotExpiry.js';
import { sendPatientAppointmentReminderEmail } from './mailService.js';

const DEFAULT_REMINDER_LOOKAHEAD_MINUTES = 5;
const DEFAULT_REMINDER_SCAN_INTERVAL_MS = 30 * 1000;

const getReminderTargetDateTime = (now = new Date()) => {
  const targetDate = new Date(now.getTime() + DEFAULT_REMINDER_LOOKAHEAD_MINUTES * 60 * 1000);
  return getDateTimeInTimeZone(targetDate);
};

const getPatientReminderNotification = ({
  id,
  providerName,
  providerType = 'doctor',
  clinicName = '',
  appointmentDate,
  fromTime,
  toTime,
  reminderSentAt
}) => {
  const normalizedProviderType = String(providerType || '').trim().toLowerCase();
  const safeProviderName = String(providerName || '').trim() || (normalizedProviderType === 'service' ? 'Service' : 'Doctor');
  const safeClinicName = String(clinicName || '').trim();
  const providerLabel = normalizedProviderType === 'service' ? safeProviderName : `Dr. ${safeProviderName}`;
  const clinicSuffix = safeClinicName ? ` at ${safeClinicName}` : '';

  return {
    id,
    type: 'appointment_reminder',
    title: 'Appointment Reminder',
    message: `Your appointment with ${providerLabel}${clinicSuffix} starts in 5 minutes on ${appointmentDate} (${fromTime} - ${toTime}).`,
    createdAt: reminderSentAt ? new Date(reminderSentAt).toISOString() : new Date().toISOString()
  };
};

const sendDoctorAppointmentReminder = async (appointment, io) => {
  const reminderSentAt = new Date();
  const lockedAppointment = await Appointment.findOneAndUpdate(
    {
      _id: appointment._id,
      reminderSentAt: null,
      bookingStatus: 'confirmed',
      paymentStatus: 'succeeded'
    },
    {
      $set: { reminderSentAt }
    },
    { new: true }
  ).lean();

  if (!lockedAppointment) {
    return;
  }

  const notification = getPatientReminderNotification({
    id: `${String(lockedAppointment._id)}:reminder`,
    providerName: lockedAppointment.doctorName,
    appointmentDate: lockedAppointment.appointmentDate,
    fromTime: lockedAppointment.fromTime,
    toTime: lockedAppointment.toTime,
    reminderSentAt
  });

  const patientId = String(lockedAppointment.patientId || '').trim();
  if (patientId && io) {
    io.to(`user:${patientId}`).emit('patient:appointment-reminder', notification);
  }

  try {
    const patientEmail = String(lockedAppointment.patientEmail || '').trim().toLowerCase()
      || String((await Patient.findById(lockedAppointment.patientId).select('email').lean())?.email || '').trim().toLowerCase();

    if (patientEmail) {
      await sendPatientAppointmentReminderEmail({
        to: patientEmail,
        patientName: lockedAppointment.patientName,
        providerName: lockedAppointment.doctorName,
        providerType: 'doctor',
        appointmentDate: lockedAppointment.appointmentDate,
        fromTime: lockedAppointment.fromTime,
        toTime: lockedAppointment.toTime,
        consultationMode: lockedAppointment.consultationMode
      });
    }
  } catch (error) {
    console.error('Patient appointment reminder email failed', {
      appointmentId: String(lockedAppointment._id),
      error: error?.message || 'Unknown error'
    });
  }
};

const sendClinicAppointmentReminder = async (appointment, io) => {
  const reminderSentAt = new Date();
  const lockedAppointment = await ClinicDoctorAppointment.findOneAndUpdate(
    {
      _id: appointment._id,
      reminderSentAt: null,
      bookingStatus: 'confirmed',
      paymentStatus: 'succeeded'
    },
    {
      $set: { reminderSentAt }
    },
    { new: true }
  ).lean();

  if (!lockedAppointment) {
    return;
  }

  const isServiceAppointment = String(lockedAppointment.providerType || '').trim().toLowerCase() === 'service';
  const providerName = isServiceAppointment
    ? lockedAppointment.serviceName || lockedAppointment.doctorName
    : lockedAppointment.doctorName;
  const notification = getPatientReminderNotification({
    id: `${String(lockedAppointment._id)}:clinic-reminder`,
    providerName,
    providerType: lockedAppointment.providerType,
    clinicName: lockedAppointment.clinicName,
    appointmentDate: lockedAppointment.appointmentDate,
    fromTime: lockedAppointment.fromTime,
    toTime: lockedAppointment.toTime,
    reminderSentAt
  });

  const patientId = String(lockedAppointment.patientId || '').trim();
  if (patientId && io) {
    io.to(`user:${patientId}`).emit('patient:appointment-reminder', notification);
  }

  try {
    const patientEmail = String(lockedAppointment.patientEmail || '').trim().toLowerCase()
      || String((await Patient.findById(lockedAppointment.patientId).select('email').lean())?.email || '').trim().toLowerCase();

    if (patientEmail) {
      await sendPatientAppointmentReminderEmail({
        to: patientEmail,
        patientName: lockedAppointment.patientName,
        providerName,
        providerType: lockedAppointment.providerType,
        clinicName: lockedAppointment.clinicName,
        appointmentDate: lockedAppointment.appointmentDate,
        fromTime: lockedAppointment.fromTime,
        toTime: lockedAppointment.toTime,
        consultationMode: lockedAppointment.consultationMode
      });
    }
  } catch (error) {
    console.error('Patient clinic appointment reminder email failed', {
      appointmentId: String(lockedAppointment._id),
      error: error?.message || 'Unknown error'
    });
  }
};

export const scanAppointmentReminders = async ({ io = null, now = new Date() } = {}) => {
  const targetDateTime = getReminderTargetDateTime(now);

  if (!targetDateTime?.date || !targetDateTime?.time) {
    return;
  }

  const query = {
    appointmentDate: targetDateTime.date,
    fromTime: targetDateTime.time,
    bookingStatus: 'confirmed',
    paymentStatus: 'succeeded',
    reminderSentAt: null
  };

  const [doctorAppointments, clinicAppointments] = await Promise.all([
    Appointment.find(query)
      .select('patientId patientName patientEmail doctorName appointmentDate fromTime toTime consultationMode reminderSentAt')
      .lean(),
    ClinicDoctorAppointment.find(query)
      .select('patientId patientName patientEmail clinicName doctorName providerType serviceName appointmentDate fromTime toTime consultationMode reminderSentAt')
      .lean()
  ]);

  await Promise.all([
    ...doctorAppointments.map((appointment) => sendDoctorAppointmentReminder(appointment, io)),
    ...clinicAppointments.map((appointment) => sendClinicAppointmentReminder(appointment, io))
  ]);
};

export const startAppointmentReminderScheduler = (io) => {
  const runScan = () => {
    scanAppointmentReminders({ io }).catch((error) => {
      console.error('Appointment reminder scan failed', error);
    });
  };

  runScan();
  const intervalId = setInterval(runScan, DEFAULT_REMINDER_SCAN_INTERVAL_MS);

  return () => {
    clearInterval(intervalId);
  };
};
