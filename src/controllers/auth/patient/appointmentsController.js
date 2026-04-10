import {
  Appointment,
  Doctor,
  Patient,
  STRIPE_CURRENCY,
  allowedConsultationModes,
  getAppointmentLifecycleStatus,
  getAppointmentStartTimestamp,
  getCommissionBreakdown,
  getDoctorAvatarUrl,
  getPatientDisplayName,
  getStripeClient,
  mapAppointmentForPatient,
  mongoose,
  normalizeAddressField,
  normalizePhoneNumber,
  phoneNumberPattern,
  sendDoctorAppointmentBookedEmail,
  sendDoctorAppointmentCancelledEmail,
  sendPatientAppointmentCancelledEmail,
  sendPatientAppointmentConfirmationEmail
} from './shared.js';

export const createPatientAppointmentPaymentIntent = async (req, res) => {
  try {
    const {
      doctorId,
      slotId,
      phoneNumber,
      streetAddress,
      aptSuite = '',
      city,
      state,
      zip
    } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: 'Invalid doctor id' });
    }

    if (!slotId) {
      return res.status(400).json({ message: 'Appointment slot is required' });
    }

    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    const normalizedStreetAddress = normalizeAddressField(streetAddress);
    const normalizedAptSuite = normalizeAddressField(aptSuite);
    const normalizedCity = normalizeAddressField(city);
    const normalizedState = normalizeAddressField(state);
    const normalizedZip = normalizeAddressField(zip);

    if (!phoneNumberPattern.test(normalizedPhoneNumber)) {
      return res.status(400).json({ message: 'Phone number must contain only digits and be 7 to 15 digits long' });
    }

    if (!normalizedStreetAddress || !normalizedCity || !normalizedState || !normalizedZip) {
      return res.status(400).json({ message: 'Complete contact address details are required' });
    }

    const patient = await Patient.findById(req.user?.id)
      .select('firstName lastName email')
      .lean();

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const doctor = await Doctor.findOne({
      _id: doctorId,
      applicationStatus: 'approved',
      emailVerified: true
    })
      .select('fullName avatarDocument availabilitySlots')
      .lean();

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const selectedSlot = Array.isArray(doctor.availabilitySlots)
      ? doctor.availabilitySlots.find((slot) => String(slot?._id) === String(slotId))
      : null;

    if (!selectedSlot) {
      return res.status(404).json({ message: 'Selected slot is no longer available' });
    }

    const slotPriceInRupees = Math.max(0, Math.trunc(Number(selectedSlot?.priceInRupees || 0)));

    if (!slotPriceInRupees) {
      return res.status(400).json({ message: 'Selected slot has an invalid consultation fee' });
    }

    const existingConfirmedBooking = await Appointment.findOne({
      doctorId: doctor._id,
      slotId: String(selectedSlot._id),
      bookingStatus: 'confirmed'
    })
      .select('_id')
      .lean();

    if (existingConfirmedBooking) {
      return res.status(409).json({ message: 'This slot has already been booked' });
    }

    const stripeClient = getStripeClient();
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: slotPriceInRupees * 100,
      currency: STRIPE_CURRENCY,
      payment_method_types: ['card'],
      metadata: {
        doctorId: String(doctor._id),
        patientId: String(patient._id),
        slotId: String(selectedSlot._id)
      }
    });

    const {
      amountInRupees,
      adminCommissionInRupees,
      doctorPayoutInRupees
    } = getCommissionBreakdown(slotPriceInRupees);

    const patientName = getPatientDisplayName(patient);
    const doctorName = String(doctor.fullName || '').trim() || 'Doctor';
    const consultationMode = String(selectedSlot?.consultationMode || '').trim().toLowerCase();

    await Appointment.findOneAndUpdate(
      {
        paymentIntentId: paymentIntent.id
      },
      {
        doctorId: doctor._id,
        patientId: patient._id,
        doctorName,
        patientName,
        patientEmail: String(patient.email || '').trim().toLowerCase(),
        doctorAvatarUrl: getDoctorAvatarUrl(doctor) || '/topdoc.svg',
        contactPhoneNumber: normalizedPhoneNumber,
        contactAddress: {
          streetAddress: normalizedStreetAddress,
          aptSuite: normalizedAptSuite,
          city: normalizedCity,
          state: normalizedState,
          zip: normalizedZip
        },
        slotId: String(selectedSlot._id),
        appointmentDate: String(selectedSlot?.date || '').trim(),
        fromTime: String(selectedSlot?.fromTime || '').trim(),
        toTime: String(selectedSlot?.toTime || '').trim(),
        consultationMode: allowedConsultationModes.has(consultationMode)
          ? consultationMode
          : 'online',
        amountInRupees,
        adminCommissionInRupees,
        doctorPayoutInRupees,
        currency: STRIPE_CURRENCY,
        paymentStatus: 'requires_payment',
        bookingStatus: 'pending'
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    return res.status(200).json({
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amountInRupees,
      adminCommissionInRupees,
      doctorPayoutInRupees,
      currency: STRIPE_CURRENCY
    });
  } catch (error) {
    if (/stripe secret key is not configured/i.test(String(error?.message || ''))) {
      return res.status(500).json({ message: 'Stripe payment is not configured on server' });
    }

    return res.status(500).json({ message: 'Could not initialize appointment payment', error: error.message });
  }
};

export const confirmPatientAppointmentPayment = async (req, res) => {
  try {
    const { paymentIntentId } = req.body || {};

    if (!paymentIntentId) {
      return res.status(400).json({ message: 'Payment intent id is required' });
    }

    const appointment = await Appointment.findOne({
      paymentIntentId: String(paymentIntentId).trim(),
      patientId: req.user?.id
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment payment session not found' });
    }

    if (appointment.bookingStatus === 'confirmed' && appointment.paymentStatus === 'succeeded') {
      return res.status(200).json({
        message: 'Appointment already confirmed',
        appointment: mapAppointmentForPatient(appointment)
      });
    }

    const stripeClient = getStripeClient();
    const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge']
    });

    if (String(paymentIntent?.metadata?.patientId || '') !== String(appointment.patientId || '')) {
      return res.status(403).json({ message: 'Payment does not belong to this patient session' });
    }

    if (paymentIntent.status !== 'succeeded') {
      appointment.paymentStatus = paymentIntent.status === 'canceled'
        ? 'canceled'
        : paymentIntent.status === 'requires_payment_method'
          ? 'requires_payment'
          : 'failed';
      await appointment.save();

      return res.status(400).json({ message: 'Payment is not completed yet' });
    }

    const amountReceivedInMinorUnits = Math.max(
      0,
      Math.trunc(Number(paymentIntent.amount_received || paymentIntent.amount || 0))
    );

    if (amountReceivedInMinorUnits < appointment.amountInRupees * 100) {
      appointment.paymentStatus = 'failed';
      await appointment.save();
      return res.status(400).json({ message: 'Payment amount verification failed' });
    }

    const slotUpdateResult = await Doctor.updateOne(
      {
        _id: appointment.doctorId,
        'availabilitySlots._id': appointment.slotId
      },
      {
        $pull: {
          availabilitySlots: {
            _id: appointment.slotId
          }
        }
      }
    );

    if (slotUpdateResult.modifiedCount === 0) {
      const conflictingAppointment = await Appointment.findOne({
        doctorId: appointment.doctorId,
        slotId: appointment.slotId,
        bookingStatus: 'confirmed'
      })
        .select('_id')
        .lean();

      appointment.bookingStatus = 'cancelled';
      appointment.paymentStatus = 'succeeded';
      await appointment.save();

      return res.status(409).json({
        message: conflictingAppointment
          ? 'This slot was booked by another patient while payment was processing. Please contact support for refund assistance.'
          : 'Selected slot is no longer available. Please contact support for refund assistance.'
      });
    }

    const cardDetails = paymentIntent?.latest_charge?.payment_method_details?.card || {};

    appointment.paymentStatus = 'succeeded';
    appointment.bookingStatus = 'confirmed';
    appointment.paymentMethodBrand = String(cardDetails.brand || '').trim();
    appointment.paymentMethodLast4 = String(cardDetails.last4 || '').trim();
    appointment.paidAt = new Date();
    await appointment.save();

    const doctorForEmail = await Doctor.findById(appointment.doctorId)
      .select('email fullName')
      .lean();

    const appointmentEmailPayload = {
      appointmentDate: appointment.appointmentDate,
      fromTime: appointment.fromTime,
      toTime: appointment.toTime,
      consultationMode: appointment.consultationMode,
      amountInRupees: appointment.amountInRupees
    };

    const emailOperations = [
      sendPatientAppointmentConfirmationEmail({
        to: appointment.patientEmail,
        patientName: appointment.patientName,
        doctorName: appointment.doctorName,
        contactPhoneNumber: appointment.contactPhoneNumber,
        contactAddress: appointment.contactAddress,
        paymentMethodBrand: appointment.paymentMethodBrand,
        paymentMethodLast4: appointment.paymentMethodLast4,
        ...appointmentEmailPayload
      })
    ];

    const doctorEmail = String(doctorForEmail?.email || '').trim().toLowerCase();

    if (doctorEmail) {
      emailOperations.push(
        sendDoctorAppointmentBookedEmail({
          to: doctorEmail,
          doctorName: String(doctorForEmail?.fullName || '').trim() || appointment.doctorName,
          patientName: appointment.patientName,
          patientEmail: appointment.patientEmail,
          patientPhoneNumber: appointment.contactPhoneNumber,
          patientAddress: appointment.contactAddress,
          ...appointmentEmailPayload
        })
      );
    }

    const emailResults = await Promise.allSettled(emailOperations);
    const failedEmailCount = emailResults.filter((result) => result.status === 'rejected').length;

    if (failedEmailCount > 0) {
      console.error('Appointment booking emails failed to send', {
        paymentIntentId,
        failedEmailCount
      });
    }

    return res.status(200).json({
      message: 'Appointment booked successfully',
      appointment: mapAppointmentForPatient(appointment)
    });
  } catch (error) {
    if (/stripe secret key is not configured/i.test(String(error?.message || ''))) {
      return res.status(500).json({ message: 'Stripe payment is not configured on server' });
    }

    return res.status(500).json({ message: 'Could not confirm appointment payment', error: error.message });
  }
};

export const getPatientAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({
      patientId: req.user?.id,
      bookingStatus: 'confirmed',
      paymentStatus: 'succeeded'
    })
      .sort({ appointmentDate: 1, fromTime: 1, createdAt: -1 })
      .lean();

    const now = new Date();

    const upcomingAppointments = appointments
      .map((appointment) => ({
        appointment,
        lifecycleStatus: getAppointmentLifecycleStatus(appointment, now)
      }))
      .filter((appointmentEntry) => appointmentEntry.lifecycleStatus === 'upcoming')
      .sort((firstEntry, secondEntry) => {
        return getAppointmentStartTimestamp(firstEntry.appointment)
          - getAppointmentStartTimestamp(secondEntry.appointment);
      })
      .map((appointmentEntry) => mapAppointmentForPatient(appointmentEntry.appointment, {
        lifecycleStatus: appointmentEntry.lifecycleStatus
      }));

    return res.status(200).json({
      appointments: upcomingAppointments
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch patient appointments', error: error.message });
  }
};

export const cancelPatientAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const confirmNoRefund = Boolean(req.body?.confirmNoRefund);

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment id' });
    }

    if (!confirmNoRefund) {
      return res.status(400).json({ message: 'Please confirm no-refund acknowledgement before cancellation' });
    }

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patientId: req.user?.id
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.paymentStatus !== 'succeeded') {
      return res.status(400).json({ message: 'Only paid appointments can be cancelled from this screen' });
    }

    if (appointment.bookingStatus === 'cancelled') {
      return res.status(200).json({
        message: 'Appointment is already cancelled',
        appointment: mapAppointmentForPatient(appointment)
      });
    }

    if (appointment.bookingStatus !== 'confirmed') {
      return res.status(400).json({ message: 'Only confirmed appointments can be cancelled' });
    }

    if (getAppointmentLifecycleStatus(appointment) === 'completed') {
      return res.status(400).json({ message: 'Completed appointments cannot be cancelled' });
    }

    appointment.bookingStatus = 'cancelled';
    appointment.cancelledAt = new Date();
    appointment.cancelledByRole = 'patient';
    appointment.refundStatus = 'not_applicable';
    appointment.refundAmountInRupees = 0;
    appointment.refundId = '';
    appointment.refundFailureReason = '';
    appointment.refundedAt = null;
    appointment.cancellationAcknowledgedNoRefund = true;
    await appointment.save();

    const doctorForEmail = await Doctor.findById(appointment.doctorId)
      .select('email fullName')
      .lean();

    const cancellationEmailPayload = {
      appointmentDate: appointment.appointmentDate,
      fromTime: appointment.fromTime,
      toTime: appointment.toTime,
      consultationMode: appointment.consultationMode,
      amountInRupees: appointment.amountInRupees
    };

    const emailOperations = [
      sendPatientAppointmentCancelledEmail({
        to: appointment.patientEmail,
        patientName: appointment.patientName,
        doctorName: appointment.doctorName,
        cancelledByRole: 'patient',
        refundStatus: 'not_applicable',
        refundAmountInRupees: 0,
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
          cancelledByRole: 'patient',
          refundStatus: 'not_applicable',
          refundAmountInRupees: 0,
          ...cancellationEmailPayload
        })
      );
    }

    const emailResults = await Promise.allSettled(emailOperations);
    const failedEmailCount = emailResults.filter((result) => result.status === 'rejected').length;

    if (failedEmailCount > 0) {
      console.error('Appointment cancellation emails failed to send', {
        appointmentId,
        failedEmailCount
      });
    }

    return res.status(200).json({
      message: 'Appointment cancelled. No refund will be processed.'
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not cancel appointment', error: error.message });
  }
};
