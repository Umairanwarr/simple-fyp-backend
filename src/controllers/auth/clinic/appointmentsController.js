import mongoose from 'mongoose';
import { Clinic } from '../../../models/Clinic.js';
import { ClinicDoctor } from '../../../models/ClinicDoctor.js';
import { ClinicDoctorAppointment } from '../../../models/ClinicDoctorAppointment.js';
import { ClinicService } from '../../../models/ClinicService.js';
import {
  getClinicAppointmentLifecycleStatus,
  isAllowedConsultationMode,
  isValidCalendarDate,
  isValidTimeValue,
  normalizeConsultationMode,
  parseClinicAppointmentDateTime,
  toMinutes
} from './appointmentShared.js';
import { getStripeClient } from '../../../services/stripeService.js';
import {
  sendDoctorAppointmentCancelledEmail,
  sendPatientAppointmentCancelledEmail,
  sendPatientAppointmentRescheduledEmail
} from '../../../services/mailService.js';

const lifecycleLabelByCode = {
  upcoming: 'Upcoming',
  ongoing: 'Ongoing',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

const normalizeRefundStatus = (refundStatus) => {
  const normalizedStatus = String(refundStatus || '').trim().toLowerCase();
  if (normalizedStatus === 'succeeded' || normalizedStatus === 'pending' || normalizedStatus === 'failed') return normalizedStatus;
  if (normalizedStatus === 'canceled') return 'failed';
  return 'pending';
};

const mapClinicAppointmentPayload = (appointmentRecord, { lifecycleStatus = null } = {}) => {
  const resolvedLifecycleStatus = lifecycleStatus || getClinicAppointmentLifecycleStatus(appointmentRecord);
  const providerType = String(appointmentRecord?.providerType || '').trim().toLowerCase() === 'service' ? 'service' : 'doctor';
  const providerId = providerType === 'service'
    ? String(appointmentRecord?.serviceId || '').trim()
    : String(appointmentRecord?.doctorId || '').trim();
  const providerName = providerType === 'service'
    ? String(appointmentRecord?.serviceName || appointmentRecord?.doctorName || '').trim()
    : String(appointmentRecord?.doctorName || '').trim();
  const providerSpecialization = providerType === 'service'
    ? String(appointmentRecord?.serviceType || '').trim().toLowerCase() === 'facility'
      ? 'Facility Service'
      : 'Lab Service'
    : String(appointmentRecord?.doctorSpecialization || '').trim();
  const serviceType = providerType === 'service'
    ? (String(appointmentRecord?.serviceType || '').trim().toLowerCase() === 'facility' ? 'facility' : 'lab')
    : '';

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
    providerType,
    serviceType,
    providerId,
    doctor: {
      id: providerId,
      name: providerName,
      specialization: providerSpecialization,
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
      ClinicDoctorAppointment.find({
        clinicId: clinic._id,
        $or: [
          { paymentStatus: 'succeeded' },
          { paymentStatus: { $exists: false } }
        ]
      })
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
      bookingStatus: 'confirmed',
      paymentStatus: 'succeeded',
      paidAt: new Date(),
      amountInRupees: 0,
      adminCommissionInRupees: 0,
      clinicPayoutInRupees: 0
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

    let refundStatus = 'not_applicable';
    let refundAmountInRupees = 0;
    let refundId = '';
    let refundFailureReason = '';
    let refundedAt = null;

    if (appointment.paymentStatus === 'succeeded' && appointment.paymentIntentId) {
      refundAmountInRupees = Math.max(0, Math.trunc(Number(appointment.amountInRupees || 0)));

      if (refundAmountInRupees > 0) {
        try {
          const stripeClient = getStripeClient();
          const refundResult = await stripeClient.refunds.create({
            payment_intent: String(appointment.paymentIntentId || '').trim(),
            amount: refundAmountInRupees * 100,
            reason: 'requested_by_customer',
            metadata: {
              appointmentId: String(appointment._id || ''),
              clinicId: String(appointment.clinicId || ''),
              patientId: String(appointment.patientId || ''),
              cancelledByRole: 'clinic'
            }
          });
          refundStatus = normalizeRefundStatus(refundResult?.status);
          refundId = String(refundResult?.id || '').trim();

          if (refundStatus === 'failed') {
            refundFailureReason = 'Stripe refund request failed';
            return res.status(502).json({
              message: 'Refund could not be processed. Appointment was not cancelled.'
            });
          }
          if (refundStatus === 'succeeded') refundedAt = new Date();
        } catch (error) {
          if (/stripe secret key is not configured/i.test(String(error?.message || ''))) {
            return res.status(500).json({ message: 'Stripe payment is not configured on server' });
          }
          return res.status(502).json({
            message: 'Refund could not be processed. Appointment was not cancelled.',
            error: error.message
          });
        }
      }
    }

    appointment.bookingStatus = 'cancelled';
    appointment.cancelledAt = new Date();
    appointment.cancelledByRole = 'clinic';
    appointment.refundStatus = refundStatus;
    appointment.refundAmountInRupees = refundAmountInRupees;
    appointment.refundId = refundId;
    appointment.refundFailureReason = refundFailureReason;
    appointment.refundedAt = refundedAt;
    appointment.clinicPayoutInRupees = 0;
    appointment.adminCommissionInRupees = 0;
    await appointment.save();

    const cancellationEmailPayload = {
      appointmentDate: appointment.appointmentDate,
      fromTime: appointment.fromTime,
      toTime: appointment.toTime,
      consultationMode: appointment.consultationMode,
      amountInRupees: appointment.amountInRupees,
      cancelledByRole: 'doctor',
      refundStatus,
      refundAmountInRupees
    };
    const isServiceAppointment = String(appointment?.providerType || '').trim().toLowerCase() === 'service';
    const providerLabel = isServiceAppointment
      ? `${appointment.clinicName || 'Clinic'} - ${appointment.serviceName || appointment.doctorName || 'Service'}`
      : `${appointment.clinicName || 'Clinic'} - Dr. ${appointment.doctorName || 'Doctor'}`;
    const emailOperations = [];

    if (appointment.patientEmail) {
      emailOperations.push(sendPatientAppointmentCancelledEmail({
        to: appointment.patientEmail,
        patientName: appointment.patientName,
        doctorName: providerLabel,
        ...cancellationEmailPayload
      }));
    }

    if (appointment.clinicEmail) {
      emailOperations.push(sendDoctorAppointmentCancelledEmail({
        to: appointment.clinicEmail,
        doctorName: appointment.clinicName || 'Clinic',
        patientName: appointment.patientName,
        patientEmail: appointment.patientEmail,
        ...cancellationEmailPayload
      }));
    }

    await Promise.allSettled(emailOperations);

    return res.status(200).json({
      message: refundStatus === 'succeeded'
        ? 'Appointment cancelled and refund processed successfully.'
        : refundStatus === 'pending'
          ? 'Appointment cancelled. Refund is being processed.'
          : 'Appointment cancelled successfully',
      appointment: mapClinicAppointmentPayload(appointment, {
        lifecycleStatus: 'cancelled'
      })
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not cancel clinic appointment', error: error.message });
  }
};

export const rescheduleClinicAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { newSlotId, reason } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment id' });
    }

    if (!mongoose.Types.ObjectId.isValid(newSlotId)) {
      return res.status(400).json({ message: 'Valid new slot id is required' });
    }

    const normalizedReason = String(reason || '').trim().replace(/\s+/g, ' ').slice(0, 500);

    if (normalizedReason.length < 5) {
      return res.status(400).json({ message: 'Reschedule reason must be at least 5 characters long' });
    }

    const clinicId = req.user?.id;

    const appointment = await ClinicDoctorAppointment.findOne({
      _id: appointmentId,
      clinicId
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.bookingStatus !== 'confirmed') {
      return res.status(400).json({ message: 'Only confirmed appointments can be rescheduled' });
    }

    const lifecycleStatus = getClinicAppointmentLifecycleStatus(appointment);

    if (lifecycleStatus !== 'upcoming') {
      return res.status(400).json({ message: 'Only upcoming appointments can be rescheduled' });
    }

    const lockedAmountInRupees = Math.max(0, Math.trunc(Number(appointment.amountInRupees || 0)));

    const isServiceAppointment = String(appointment?.providerType || '').trim().toLowerCase() === 'service' && appointment?.serviceId;
    const providerRecord = isServiceAppointment
      ? await ClinicService.findOne({ _id: appointment.serviceId, clinicId })
      : await ClinicDoctor.findOne({ _id: appointment.doctorId, clinicId });

    if (!providerRecord) {
      return res.status(404).json({ message: isServiceAppointment ? 'Service not found' : 'Doctor not found' });
    }

    const selectedNewSlot = providerRecord.availabilitySlots.id(newSlotId);

    if (!selectedNewSlot) {
      return res.status(404).json({ message: 'Selected new slot is no longer available' });
    }

    if (String(appointment.slotId || '') === String(selectedNewSlot._id || '')) {
      return res.status(400).json({ message: 'Please select a different slot for rescheduling' });
    }

    const nextAppointmentDate = String(selectedNewSlot?.date || '').trim();
    const nextFromTime = String(selectedNewSlot?.fromTime || '').trim();
    const nextToTime = String(selectedNewSlot?.toTime || '').trim();
    const nextConsultationMode = String(selectedNewSlot?.consultationMode || '').trim().toLowerCase() === 'offline' ? 'offline' : 'online';

    const nextAppointmentStart = parseClinicAppointmentDateTime({
      date: nextAppointmentDate,
      time: nextFromTime
    });

    if (!nextAppointmentStart || nextAppointmentStart.getTime() <= Date.now()) {
      return res.status(400).json({ message: 'Please select a future slot for rescheduling' });
    }

    const previousAppointmentDate = String(appointment.appointmentDate || '').trim();
    const previousFromTime = String(appointment.fromTime || '').trim();
    const previousToTime = String(appointment.toTime || '').trim();
    const previousConsultationMode = appointment.consultationMode;
    const previousSlotId = appointment.slotId;

    const normalizedNewSlotId = String(selectedNewSlot._id || '').trim();

    // Check for overlapping clinic appointments for this doctor.
    const conflictingAppointment = await ClinicDoctorAppointment.findOne({
      clinicId,
      ...(isServiceAppointment
        ? { providerType: 'service', serviceId: appointment.serviceId }
        : { $or: [{ providerType: { $exists: false } }, { providerType: 'doctor' }], doctorId: appointment.doctorId }),
      bookingStatus: 'confirmed',
      appointmentDate: nextAppointmentDate,
      _id: { $ne: appointment._id }
    }).lean();

    if (conflictingAppointment) {
      const currentStart = toMinutes(conflictingAppointment.fromTime);
      const currentEnd = toMinutes(conflictingAppointment.toTime);
      const incomingStart = toMinutes(nextFromTime);
      const incomingEnd = toMinutes(nextToTime);

      if (incomingStart < currentEnd && incomingEnd > currentStart) {
        return res.status(409).json({ message: 'Selected new slot overlaps with an existing appointment. Please choose another slot.' });
      }
    }

    appointment.slotId = normalizedNewSlotId;
    appointment.appointmentDate = nextAppointmentDate;
    appointment.fromTime = nextFromTime;
    appointment.toTime = nextToTime;
    appointment.consultationMode = nextConsultationMode;
    appointment.rescheduledAt = new Date();
    appointment.rescheduledByRole = 'clinic';
    appointment.rescheduleReason = normalizedReason;
    appointment.previousAppointmentDate = previousAppointmentDate;
    appointment.previousFromTime = previousFromTime;
    appointment.previousToTime = previousToTime;

    try {
      await appointment.save();
    } catch (saveError) {
      if (saveError?.code === 11000) {
        return res.status(409).json({ message: 'Selected new slot is already booked.' });
      }
      throw saveError;
    }

    // Try pulling the new slot from doctor availability
    const providerAvailabilityPullResult = isServiceAppointment
      ? await ClinicService.updateOne(
          { _id: appointment.serviceId, 'availabilitySlots._id': newSlotId },
          { $pull: { availabilitySlots: { _id: newSlotId } } }
        )
      : await ClinicDoctor.updateOne(
          { _id: appointment.doctorId, 'availabilitySlots._id': newSlotId },
          { $pull: { availabilitySlots: { _id: newSlotId } } }
        );

    if (!providerAvailabilityPullResult.modifiedCount) {
      // Revert if pulling failed
      appointment.slotId = previousSlotId;
      appointment.appointmentDate = previousAppointmentDate;
      appointment.fromTime = previousFromTime;
      appointment.toTime = previousToTime;
      appointment.consultationMode = previousConsultationMode;
      appointment.rescheduledAt = null;
      appointment.rescheduledByRole = '';
      appointment.rescheduleReason = '';
      appointment.previousAppointmentDate = '';
      appointment.previousFromTime = '';
      appointment.previousToTime = '';
      await appointment.save();

      return res.status(409).json({ message: 'Selected new slot is no longer available. Please choose another slot.' });
    }

    const patientEmail = String(appointment.patientEmail || '').trim().toLowerCase();

    if (patientEmail) {
      try {
        await sendPatientAppointmentRescheduledEmail({
          to: patientEmail,
          patientName: appointment.patientName,
          doctorName: appointment.doctorName,
          previousAppointmentDate,
          previousFromTime,
          previousToTime,
          appointmentDate: appointment.appointmentDate,
          fromTime: appointment.fromTime,
          toTime: appointment.toTime,
          consultationMode: appointment.consultationMode,
          amountInRupees: lockedAmountInRupees,
          reason: normalizedReason
        });
      } catch (error) {
        console.error('Patient reschedule email failed to send', { appointmentId, error: error?.message || 'Unknown error' });
      }
    }

    return res.status(200).json({
      message: 'Appointment rescheduled successfully. Patient has been notified.',
      appointment: mapClinicAppointmentPayload(appointment, { lifecycleStatus: 'upcoming' })
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not reschedule appointment', error: error.message });
  }
};
