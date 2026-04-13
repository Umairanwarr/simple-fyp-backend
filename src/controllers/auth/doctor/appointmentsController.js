import mongoose from 'mongoose';
import {
  Appointment,
  Doctor,
  getDoctorAppointmentLifecycleStatus,
  getStripeClient,
  mapDoctorAppointmentForDashboard,
  sendDoctorAppointmentCancelledEmail,
  sendPatientAppointmentRescheduledEmail,
  sendPatientAppointmentCancelledEmail
} from './shared.js';

const getAppointmentStartSortTimestamp = (appointmentRecord) => {
  const appointmentDate = String(appointmentRecord?.appointmentDate || '').trim();
  const fromTime = String(appointmentRecord?.fromTime || '').trim();
  const parsedDate = new Date(`${appointmentDate}T${fromTime}:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return 0;
  }

  return parsedDate.getTime();
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

const normalizeRefundStatus = (refundStatus) => {
  const normalizedStatus = String(refundStatus || '').trim().toLowerCase();

  if (normalizedStatus === 'succeeded' || normalizedStatus === 'pending' || normalizedStatus === 'failed') {
    return normalizedStatus;
  }

  if (normalizedStatus === 'canceled') {
    return 'failed';
  }

  return 'pending';
};

const formatCurrencyInRupees = (amountInRupees) => {
  const normalizedAmount = Math.max(0, Math.trunc(Number(amountInRupees || 0)));
  return `Rs ${normalizedAmount.toLocaleString('en-PK')}`;
};

const normalizeRescheduleReason = (reasonValue) => {
  return String(reasonValue || '').trim().replace(/\s+/g, ' ').slice(0, 500);
};

export const getDoctorAppointments = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user?.id)
      .select('_id')
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
      .select(
        'patientId patientName patientEmail contactPhoneNumber appointmentDate fromTime toTime consultationMode amountInRupees bookingStatus paymentStatus cancelledAt createdAt updatedAt'
      )
      .lean();

    const now = new Date();

    const categorizedAppointments = appointments
      .map((appointment) => {
        const lifecycleStatus = getDoctorAppointmentLifecycleStatus(appointment, now);

        return {
          appointment,
          lifecycleStatus,
          sortTimestamp: getAppointmentStartSortTimestamp(appointment)
        };
      });

    const upcomingAppointments = categorizedAppointments
      .filter((entry) => entry.lifecycleStatus === 'upcoming')
      .sort((firstEntry, secondEntry) => firstEntry.sortTimestamp - secondEntry.sortTimestamp)
      .map((entry) => mapDoctorAppointmentForDashboard(entry.appointment, {
        lifecycleStatus: entry.lifecycleStatus
      }));

    const ongoingAppointments = categorizedAppointments
      .filter((entry) => entry.lifecycleStatus === 'ongoing')
      .sort((firstEntry, secondEntry) => firstEntry.sortTimestamp - secondEntry.sortTimestamp)
      .map((entry) => mapDoctorAppointmentForDashboard(entry.appointment, {
        lifecycleStatus: entry.lifecycleStatus
      }));

    const cancelledAppointments = categorizedAppointments
      .filter((entry) => entry.lifecycleStatus === 'cancelled')
      .sort((firstEntry, secondEntry) => {
        return getCancelledSortTimestamp(secondEntry.appointment) - getCancelledSortTimestamp(firstEntry.appointment);
      })
      .map((entry) => mapDoctorAppointmentForDashboard(entry.appointment, {
        lifecycleStatus: entry.lifecycleStatus
      }));

    return res.status(200).json({
      upcomingAppointments,
      ongoingAppointments,
      cancelledAppointments
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch doctor appointments', error: error.message });
  }
};

export const cancelDoctorUpcomingAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment id' });
    }

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      doctorId: req.user?.id
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.bookingStatus === 'cancelled') {
      return res.status(200).json({
        message: 'Appointment is already cancelled',
        refundStatus: String(appointment.refundStatus || '').trim() || 'not_requested',
        refundAmountInRupees: Math.max(0, Math.trunc(Number(appointment.refundAmountInRupees || 0)))
      });
    }

    if (appointment.paymentStatus !== 'succeeded') {
      return res.status(400).json({ message: 'Only paid appointments can be cancelled from this screen' });
    }

    if (appointment.bookingStatus !== 'confirmed') {
      return res.status(400).json({ message: 'Only confirmed appointments can be cancelled' });
    }

    const lifecycleStatus = getDoctorAppointmentLifecycleStatus(appointment);

    if (lifecycleStatus !== 'upcoming') {
      return res.status(400).json({ message: 'Only upcoming appointments can be cancelled' });
    }

    const doctorPayoutBeforeCancellation = Math.max(0, Math.trunc(Number(appointment.doctorPayoutInRupees || 0)));
    let refundStatus = doctorPayoutBeforeCancellation > 0 ? 'pending' : 'not_applicable';
    let refundId = '';
    let refundFailureReason = '';
    let refundedAt = null;

    if (doctorPayoutBeforeCancellation > 0) {
      let refundResult;

      try {
        const stripeClient = getStripeClient();

        refundResult = await stripeClient.refunds.create({
          payment_intent: String(appointment.paymentIntentId || '').trim(),
          amount: doctorPayoutBeforeCancellation * 100,
          reason: 'requested_by_customer',
          metadata: {
            appointmentId: String(appointment._id || ''),
            doctorId: String(appointment.doctorId || ''),
            patientId: String(appointment.patientId || ''),
            cancelledByRole: 'doctor'
          }
        });
      } catch (error) {
        if (/stripe secret key is not configured/i.test(String(error?.message || ''))) {
          return res.status(500).json({ message: 'Stripe payment is not configured on server' });
        }

        return res.status(502).json({
          message: 'Refund could not be processed. Appointment was not cancelled.',
          error: error.message
        });
      }

      refundStatus = normalizeRefundStatus(refundResult?.status);
      refundId = String(refundResult?.id || '').trim();

      if (refundStatus === 'failed') {
        refundFailureReason = 'Stripe refund request failed';

        return res.status(502).json({
          message: 'Refund could not be processed. Appointment was not cancelled. Please try again later.'
        });
      }

      if (refundStatus === 'succeeded') {
        refundedAt = new Date();
      }
    }

    appointment.bookingStatus = 'cancelled';
    appointment.cancelledAt = new Date();
    appointment.cancelledByRole = 'doctor';
    appointment.cancellationAcknowledgedNoRefund = false;
    appointment.refundStatus = refundStatus;
    appointment.refundAmountInRupees = doctorPayoutBeforeCancellation;
    appointment.refundId = refundId;
    appointment.refundFailureReason = refundFailureReason;
    appointment.refundedAt = refundedAt;
    appointment.doctorPayoutInRupees = 0;
    await appointment.save();

    const doctorForEmail = await Doctor.findById(appointment.doctorId)
      .select('email fullName')
      .lean();

    const cancellationEmailPayload = {
      appointmentDate: appointment.appointmentDate,
      fromTime: appointment.fromTime,
      toTime: appointment.toTime,
      consultationMode: appointment.consultationMode,
      amountInRupees: appointment.amountInRupees,
      cancelledByRole: 'doctor',
      refundStatus,
      refundAmountInRupees: doctorPayoutBeforeCancellation
    };

    const emailOperations = [
      sendPatientAppointmentCancelledEmail({
        to: appointment.patientEmail,
        patientName: appointment.patientName,
        doctorName: appointment.doctorName,
        ...cancellationEmailPayload
      })
    ];

    const doctorEmail = String(doctorForEmail?.email || '').trim().toLowerCase();

    if (doctorEmail) {
      emailOperations.push(
        sendDoctorAppointmentCancelledEmail({
          to: doctorEmail,
          doctorName: String(doctorForEmail?.fullName || '').trim() || appointment.doctorName,
          patientName: appointment.patientName,
          patientEmail: appointment.patientEmail,
          ...cancellationEmailPayload
        })
      );
    }

    const emailResults = await Promise.allSettled(emailOperations);
    const failedEmailCount = emailResults.filter((result) => result.status === 'rejected').length;

    if (failedEmailCount > 0) {
      console.error('Doctor cancellation emails failed to send', {
        appointmentId,
        failedEmailCount
      });
    }

    const refundAmountLabel = formatCurrencyInRupees(doctorPayoutBeforeCancellation);
    const responseMessage = refundStatus === 'succeeded'
      ? `Appointment cancelled and ${refundAmountLabel} refund has been processed to the patient.`
      : refundStatus === 'pending'
        ? `Appointment cancelled. ${refundAmountLabel} refund is being processed for the patient.`
        : 'Appointment cancelled successfully.';

    return res.status(200).json({
      message: responseMessage,
      refundStatus,
      refundAmountInRupees: doctorPayoutBeforeCancellation
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not cancel appointment', error: error.message });
  }
};

export const rescheduleDoctorUpcomingAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { newSlotId, reason } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment id' });
    }

    if (!mongoose.Types.ObjectId.isValid(newSlotId)) {
      return res.status(400).json({ message: 'Valid new slot id is required' });
    }

    const normalizedReason = normalizeRescheduleReason(reason);

    if (normalizedReason.length < 5) {
      return res.status(400).json({ message: 'Reschedule reason must be at least 5 characters long' });
    }

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      doctorId: req.user?.id
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.paymentStatus !== 'succeeded') {
      return res.status(400).json({ message: 'Only paid appointments can be rescheduled' });
    }

    if (appointment.bookingStatus !== 'confirmed') {
      return res.status(400).json({ message: 'Only confirmed appointments can be rescheduled' });
    }

    const lifecycleStatus = getDoctorAppointmentLifecycleStatus(appointment);

    if (lifecycleStatus !== 'upcoming') {
      return res.status(400).json({ message: 'Only upcoming appointments can be rescheduled' });
    }

    const lockedAmountInRupees = Math.max(0, Math.trunc(Number(appointment.amountInRupees || 0)));
    const lockedAdminCommissionInRupees = Math.max(0, Math.trunc(Number(appointment.adminCommissionInRupees || 0)));
    const lockedDoctorPayoutInRupees = Math.max(0, Math.trunc(Number(appointment.doctorPayoutInRupees || 0)));

    const doctor = await Doctor.findById(req.user?.id)
      .select('fullName email address availabilitySlots');

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const selectedNewSlot = doctor.availabilitySlots.id(newSlotId);

    if (!selectedNewSlot) {
      return res.status(404).json({ message: 'Selected new slot is no longer available' });
    }

    if (String(appointment.slotId || '') === String(selectedNewSlot._id || '')) {
      return res.status(400).json({ message: 'Please select a different slot for rescheduling' });
    }

    const nextAppointmentDate = String(selectedNewSlot?.date || '').trim();
    const nextFromTime = String(selectedNewSlot?.fromTime || '').trim();
    const nextToTime = String(selectedNewSlot?.toTime || '').trim();
    const nextConsultationMode = String(selectedNewSlot?.consultationMode || '').trim().toLowerCase() === 'offline'
      ? 'offline'
      : 'online';

    const nextAppointmentTimestamp = getAppointmentStartSortTimestamp({
      appointmentDate: nextAppointmentDate,
      fromTime: nextFromTime
    });

    if (!nextAppointmentTimestamp || nextAppointmentTimestamp <= Date.now()) {
      return res.status(400).json({ message: 'Please select a future slot for rescheduling' });
    }

    const previousAppointmentDate = String(appointment.appointmentDate || '').trim();
    const previousFromTime = String(appointment.fromTime || '').trim();
    const previousToTime = String(appointment.toTime || '').trim();
    const previousSlotId = String(appointment.slotId || '').trim();
    const previousConsultationMode = String(appointment.consultationMode || '').trim().toLowerCase() === 'offline'
      ? 'offline'
      : 'online';

    const normalizedNewSlotId = String(selectedNewSlot._id || '').trim();

    const conflictingConfirmedAppointment = await Appointment.findOne({
      doctorId: req.user?.id,
      slotId: normalizedNewSlotId,
      bookingStatus: 'confirmed',
      _id: {
        $ne: appointment._id
      }
    })
      .select('_id')
      .lean();

    if (conflictingConfirmedAppointment) {
      return res.status(409).json({ message: 'Selected new slot is already booked. Please choose another slot.' });
    }

    appointment.slotId = normalizedNewSlotId;
    appointment.appointmentDate = nextAppointmentDate;
    appointment.fromTime = nextFromTime;
    appointment.toTime = nextToTime;
    appointment.consultationMode = nextConsultationMode;
    // Keep the originally paid amount unchanged during rescheduling.
    appointment.amountInRupees = lockedAmountInRupees;
    appointment.adminCommissionInRupees = lockedAdminCommissionInRupees;
    appointment.doctorPayoutInRupees = lockedDoctorPayoutInRupees;
    appointment.rescheduledAt = new Date();
    appointment.rescheduledByRole = 'doctor';
    appointment.rescheduleReason = normalizedReason;
    appointment.previousAppointmentDate = previousAppointmentDate;
    appointment.previousFromTime = previousFromTime;
    appointment.previousToTime = previousToTime;

    try {
      await appointment.save();
    } catch (saveError) {
      if (saveError?.code === 11000) {
        return res.status(409).json({
          message: 'Selected new slot is already booked. Please choose another slot.'
        });
      }

      throw saveError;
    }

    const doctorAvailabilityPullResult = await Doctor.updateOne(
      {
        _id: req.user?.id,
        'availabilitySlots._id': newSlotId
      },
      {
        $pull: {
          availabilitySlots: {
            _id: newSlotId
          }
        }
      }
    );

    if (!doctorAvailabilityPullResult.modifiedCount) {
      appointment.slotId = previousSlotId;
      appointment.appointmentDate = previousAppointmentDate;
      appointment.fromTime = previousFromTime;
      appointment.toTime = previousToTime;
      appointment.consultationMode = previousConsultationMode;
      appointment.amountInRupees = lockedAmountInRupees;
      appointment.adminCommissionInRupees = lockedAdminCommissionInRupees;
      appointment.doctorPayoutInRupees = lockedDoctorPayoutInRupees;
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
        console.error('Patient reschedule email failed to send', {
          appointmentId,
          error: error?.message || 'Unknown error'
        });
      }
    }

    return res.status(200).json({
      message: `Appointment rescheduled successfully. Patient has been notified. Original fee remains ${formatCurrencyInRupees(lockedAmountInRupees)}.`,
      amountInRupees: lockedAmountInRupees,
      pricingLocked: true,
      appointment: mapDoctorAppointmentForDashboard(appointment, {
        lifecycleStatus: 'upcoming'
      })
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Selected new slot is already booked. Please choose another slot.' });
    }

    console.error('Doctor appointment reschedule failed', {
      appointmentId: req.params?.appointmentId,
      doctorId: req.user?.id,
      error: error?.message || 'Unknown error'
    });

    return res.status(500).json({
      message: error?.message
        ? `Could not reschedule appointment: ${error.message}`
        : 'Could not reschedule appointment',
      error: error.message
    });
  }
};
