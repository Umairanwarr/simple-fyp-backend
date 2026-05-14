import mongoose from 'mongoose';
import { Clinic } from '../../../models/Clinic.js';
import { ClinicDoctor } from '../../../models/ClinicDoctor.js';
import { ClinicDoctorAppointment } from '../../../models/ClinicDoctorAppointment.js';
import {
  getClinicAppointmentLifecycleStatus,
  isAllowedConsultationMode,
  isValidCalendarDate,
  isValidTimeValue,
  normalizeConsultationMode,
  parseClinicAppointmentDateTime,
  toMinutes
} from './appointmentShared.js';

const lifecycleLabelByCode = {
  upcoming: 'Upcoming',
  ongoing: 'Ongoing',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

const mapClinicAppointmentPayload = (appointmentRecord, { lifecycleStatus = null } = {}) => {
  const resolvedLifecycleStatus = lifecycleStatus || getClinicAppointmentLifecycleStatus(appointmentRecord);

  return {
    id: String(appointmentRecord?._id || ''),
    status: lifecycleLabelByCode[resolvedLifecycleStatus] || 'Upcoming',
    statusCode: resolvedLifecycleStatus,
    date: String(appointmentRecord?.appointmentDate || '').trim(),
    fromTime: String(appointmentRecord?.fromTime || '').trim(),
    toTime: String(appointmentRecord?.toTime || '').trim(),
    consultationMode: normalizeConsultationMode(appointmentRecord?.consultationMode),
    createdAt: appointmentRecord?.createdAt || null,
    cancelledAt: appointmentRecord?.cancelledAt || null,
    patientName: String(appointmentRecord?.patientName || '').trim(),
    patientPhone: String(appointmentRecord?.patientPhone || '').trim(),
    doctor: {
      id: String(appointmentRecord?.doctorId || ''),
      name: String(appointmentRecord?.doctorName || '').trim(),
      specialization: String(appointmentRecord?.doctorSpecialization || '').trim(),
      avatarUrl: String(appointmentRecord?.doctorAvatarUrl || '').trim()
    }
  };
};

const getAppointmentStartSortTimestamp = (appointmentRecord) => {
  const appointmentStart = parseClinicAppointmentDateTime({
    date: appointmentRecord?.appointmentDate,
    time: appointmentRecord?.fromTime
  });

  if (!appointmentStart) {
    return 0;
  }

  return appointmentStart.getTime();
};

const getCancelledSortTimestamp = (appointmentRecord) => {
  const cancelledTimestamp = appointmentRecord?.cancelledAt
    ? new Date(appointmentRecord.cancelledAt).getTime()
    : 0;

  if (Number.isFinite(cancelledTimestamp) && cancelledTimestamp > 0) {
    return cancelledTimestamp;
  }

  return getAppointmentStartSortTimestamp(appointmentRecord);
};

const mapDoctorSummary = ({ doctors, appointments, now = new Date() }) => {
  const doctorSummaryById = new Map();

  (Array.isArray(doctors) ? doctors : []).forEach((doctorRecord) => {
    const doctorId = String(doctorRecord?._id || '').trim();

    if (!doctorId) {
      return;
    }

    doctorSummaryById.set(doctorId, {
      doctorId,
      doctorName: String(doctorRecord?.fullName || '').trim(),
      doctorSpecialization: String(doctorRecord?.specialization || '').trim(),
      doctorAvatarUrl: String(doctorRecord?.avatarDocument?.url || '').trim(),
      totalAppointments: 0,
      upcomingAppointments: 0,
      ongoingAppointments: 0,
      cancelledAppointments: 0,
      nextAppointment: null,
      _nextAppointmentTimestamp: Number.POSITIVE_INFINITY
    });
  });

  (Array.isArray(appointments) ? appointments : []).forEach((appointmentRecord) => {
    const doctorId = String(appointmentRecord?.doctorId || '').trim();

    if (!doctorId) {
      return;
    }

    if (!doctorSummaryById.has(doctorId)) {
      doctorSummaryById.set(doctorId, {
        doctorId,
        doctorName: String(appointmentRecord?.doctorName || '').trim(),
        doctorSpecialization: String(appointmentRecord?.doctorSpecialization || '').trim(),
        doctorAvatarUrl: String(appointmentRecord?.doctorAvatarUrl || '').trim(),
        totalAppointments: 0,
        upcomingAppointments: 0,
        ongoingAppointments: 0,
        cancelledAppointments: 0,
        nextAppointment: null,
        _nextAppointmentTimestamp: Number.POSITIVE_INFINITY
      });
    }

    const doctorSummary = doctorSummaryById.get(doctorId);
    doctorSummary.totalAppointments += 1;

    const lifecycleStatus = getClinicAppointmentLifecycleStatus(appointmentRecord, now);

    if (lifecycleStatus === 'cancelled') {
      doctorSummary.cancelledAppointments += 1;
      return;
    }

    if (lifecycleStatus === 'ongoing') {
      doctorSummary.ongoingAppointments += 1;
      return;
    }

    if (lifecycleStatus === 'upcoming') {
      doctorSummary.upcomingAppointments += 1;

      const appointmentStartTimestamp = getAppointmentStartSortTimestamp(appointmentRecord);

      if (appointmentStartTimestamp > 0 && appointmentStartTimestamp < doctorSummary._nextAppointmentTimestamp) {
        doctorSummary._nextAppointmentTimestamp = appointmentStartTimestamp;
        doctorSummary.nextAppointment = {
          date: String(appointmentRecord?.appointmentDate || '').trim(),
          fromTime: String(appointmentRecord?.fromTime || '').trim(),
          toTime: String(appointmentRecord?.toTime || '').trim()
        };
      }
    }
  });

  return [...doctorSummaryById.values()]
    .map((summaryRecord) => {
      const {
        _nextAppointmentTimestamp,
        ...summaryPayload
      } = summaryRecord;
      return summaryPayload;
    })
    .sort((firstSummary, secondSummary) => {
      return String(firstSummary.doctorName || '').localeCompare(String(secondSummary.doctorName || ''));
    });
};

export const getClinicAppointments = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.user?.id)
      .select('name email')
      .lean();

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    const [doctors, appointments] = await Promise.all([
      ClinicDoctor.find({ clinicId: clinic._id })
        .select('fullName specialization avatarDocument')
        .lean(),
      ClinicDoctorAppointment.find({ clinicId: clinic._id })
        .sort({ appointmentDate: 1, fromTime: 1, createdAt: -1 })
        .lean()
    ]);

    const now = new Date();

    const categorizedAppointments = appointments.map((appointmentRecord) => {
      const lifecycleStatus = getClinicAppointmentLifecycleStatus(appointmentRecord, now);

      return {
        appointmentRecord,
        lifecycleStatus,
        sortTimestamp: getAppointmentStartSortTimestamp(appointmentRecord)
      };
    });

    const upcomingAppointments = categorizedAppointments
      .filter((entry) => entry.lifecycleStatus === 'upcoming')
      .sort((firstEntry, secondEntry) => firstEntry.sortTimestamp - secondEntry.sortTimestamp)
      .map((entry) => mapClinicAppointmentPayload(entry.appointmentRecord, { lifecycleStatus: entry.lifecycleStatus }));

    const ongoingAppointments = categorizedAppointments
      .filter((entry) => entry.lifecycleStatus === 'ongoing')
      .sort((firstEntry, secondEntry) => firstEntry.sortTimestamp - secondEntry.sortTimestamp)
      .map((entry) => mapClinicAppointmentPayload(entry.appointmentRecord, { lifecycleStatus: entry.lifecycleStatus }));

    const cancelledAppointments = categorizedAppointments
      .filter((entry) => entry.lifecycleStatus === 'cancelled')
      .sort((firstEntry, secondEntry) => {
        return getCancelledSortTimestamp(secondEntry.appointmentRecord) - getCancelledSortTimestamp(firstEntry.appointmentRecord);
      })
      .map((entry) => mapClinicAppointmentPayload(entry.appointmentRecord, { lifecycleStatus: entry.lifecycleStatus }));

    return res.status(200).json({
      upcomingAppointments,
      ongoingAppointments,
      cancelledAppointments,
      doctorSummaries: mapDoctorSummary({
        doctors,
        appointments,
        now
      })
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch clinic appointments', error: error.message });
  }
};

export const createClinicAppointment = async (req, res) => {
  try {
    const {
      doctorId,
      appointmentDate,
      fromTime,
      toTime,
      consultationMode = 'offline'
    } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: 'Valid doctor id is required' });
    }

    const normalizedDate = String(appointmentDate || '').trim();
    const normalizedFromTime = String(fromTime || '').trim();
    const normalizedToTime = String(toTime || '').trim();

    if (!isValidCalendarDate(normalizedDate)) {
      return res.status(400).json({ message: 'Appointment date must be in YYYY-MM-DD format' });
    }

    if (!isValidTimeValue(normalizedFromTime) || !isValidTimeValue(normalizedToTime)) {
      return res.status(400).json({ message: 'Time must be in HH:MM 24-hour format' });
    }

    if (toMinutes(normalizedFromTime) >= toMinutes(normalizedToTime)) {
      return res.status(400).json({ message: 'Start time must be earlier than end time' });
    }

    const appointmentStart = parseClinicAppointmentDateTime({
      date: normalizedDate,
      time: normalizedFromTime
    });

    if (!appointmentStart || appointmentStart.getTime() <= Date.now()) {
      return res.status(400).json({ message: 'Only future appointments can be scheduled' });
    }

    const normalizedConsultationMode = normalizeConsultationMode(consultationMode);

    if (!isAllowedConsultationMode(normalizedConsultationMode)) {
      return res.status(400).json({ message: 'Consultation mode must be online, offline, or video' });
    }

    const clinic = await Clinic.findById(req.user?.id)
      .select('name email')
      .lean();

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    const doctor = await ClinicDoctor.findOne({
      _id: doctorId,
      clinicId: clinic._id
    })
      .select('fullName specialization avatarDocument')
      .lean();

    if (!doctor) {
      return res.status(404).json({ message: 'Selected doctor does not belong to your clinic' });
    }

    const confirmedAppointmentsForDoctor = await ClinicDoctorAppointment.find({
      clinicId: clinic._id,
      doctorId: doctor._id,
      appointmentDate: normalizedDate,
      bookingStatus: 'confirmed'
    })
      .select('fromTime toTime')
      .lean();

    const hasOverlappingAppointment = confirmedAppointmentsForDoctor.some((appointmentRecord) => {
      const currentStart = toMinutes(appointmentRecord?.fromTime);
      const currentEnd = toMinutes(appointmentRecord?.toTime);
      const incomingStart = toMinutes(normalizedFromTime);
      const incomingEnd = toMinutes(normalizedToTime);

      return incomingStart < currentEnd && incomingEnd > currentStart;
    });

    if (hasOverlappingAppointment) {
      return res.status(409).json({
        message: 'This appointment overlaps with an existing appointment for the selected doctor'
      });
    }

    const createdAppointment = await ClinicDoctorAppointment.create({
      clinicId: clinic._id,
      clinicName: String(clinic.name || '').trim(),
      clinicEmail: String(clinic.email || '').trim().toLowerCase(),
      doctorId: doctor._id,
      doctorName: String(doctor.fullName || '').trim(),
      doctorSpecialization: String(doctor.specialization || '').trim(),
      doctorAvatarUrl: String(doctor?.avatarDocument?.url || '').trim(),
      appointmentDate: normalizedDate,
      fromTime: normalizedFromTime,
      toTime: normalizedToTime,
      consultationMode: normalizedConsultationMode,
      bookingStatus: 'confirmed'
    });

    return res.status(201).json({
      message: 'Appointment scheduled successfully',
      appointment: mapClinicAppointmentPayload(createdAppointment, {
        lifecycleStatus: 'upcoming'
      })
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not schedule clinic appointment', error: error.message });
  }
};

export const cancelClinicAppointment = async (req, res) => {
  try {
    const appointmentId = String(req.params?.appointmentId || '').trim();

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment id' });
    }

    const appointment = await ClinicDoctorAppointment.findOne({
      _id: appointmentId,
      clinicId: req.user?.id
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.bookingStatus === 'cancelled') {
      return res.status(200).json({
        message: 'Appointment already cancelled',
        appointment: mapClinicAppointmentPayload(appointment, {
          lifecycleStatus: 'cancelled'
        })
      });
    }

    const lifecycleStatus = getClinicAppointmentLifecycleStatus(appointment);

    if (lifecycleStatus !== 'upcoming') {
      return res.status(400).json({ message: 'Only upcoming appointments can be cancelled' });
    }

    appointment.bookingStatus = 'cancelled';
    appointment.cancelledAt = new Date();
    appointment.cancelledByRole = 'clinic';
    await appointment.save();

    return res.status(200).json({
      message: 'Appointment cancelled successfully',
      appointment: mapClinicAppointmentPayload(appointment, {
        lifecycleStatus: 'cancelled'
      })
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not cancel clinic appointment', error: error.message });
  }
};
