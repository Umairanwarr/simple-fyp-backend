import mongoose from 'mongoose';
import {
  Appointment,
  Doctor,
  getDoctorAppointmentLifecycleStatus,
  getStripeClient,
  mapDoctorAppointmentForDashboard,
  sendDoctorAppointmentCancelledEmail,
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
