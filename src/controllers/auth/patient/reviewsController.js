import {
  Appointment,
  Doctor,
  getDoctorRatingSummaryFromReviews,
  isAppointmentReviewEligible,
  mapPendingReviewAppointment,
  mongoose,
  normalizeAppointmentReviewStatus,
  normalizeReviewComment
} from './shared.js';

export const getPatientPendingReviewAppointment = async (req, res) => {
  try {
    const appointments = await Appointment.find({
      patientId: req.user?.id,
      bookingStatus: 'confirmed',
      paymentStatus: 'succeeded',
      reviewStatus: 'pending'
    })
      .select('doctorId doctorName doctorAvatarUrl appointmentDate fromTime toTime amountInRupees bookingStatus paymentStatus reviewStatus')
      .sort({ appointmentDate: 1, toTime: 1, createdAt: 1 })
      .lean();

    const now = new Date();
    const pendingReviewAppointment = appointments.find((appointment) => {
      return isAppointmentReviewEligible(appointment, now);
    });

    return res.status(200).json({
      appointment: pendingReviewAppointment
        ? mapPendingReviewAppointment(pendingReviewAppointment)
        : null
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch pending review appointment', error: error.message });
  }
};

export const submitPatientAppointmentReview = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const normalizedRating = Math.trunc(Number(req.body?.rating));
    const normalizedComment = normalizeReviewComment(req.body?.comment);

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment id' });
    }

    if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      return res.status(400).json({ message: 'Rating must be a whole number between 1 and 5' });
    }

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patientId: req.user?.id,
      bookingStatus: 'confirmed',
      paymentStatus: 'succeeded'
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const reviewStatus = normalizeAppointmentReviewStatus(appointment);

    if (reviewStatus === 'submitted') {
      return res.status(409).json({ message: 'You already rated this appointment' });
    }

    if (reviewStatus === 'skipped') {
      return res.status(409).json({ message: 'You skipped this appointment review and cannot rate it now' });
    }

    if (!isAppointmentReviewEligible(appointment)) {
      return res.status(400).json({ message: 'You can review this appointment only after it is completed' });
    }

    const doctor = await Doctor.findById(appointment.doctorId)
      .select('reviews averageRating totalReviews');

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const reviewCreatedAt = new Date();

    appointment.reviewStatus = 'submitted';
    appointment.reviewRating = normalizedRating;
    appointment.reviewComment = normalizedComment;
    appointment.reviewedAt = reviewCreatedAt;
    appointment.reviewSkippedAt = null;
    appointment.reviewSkipConfirmed = false;
    await appointment.save();

    doctor.reviews.push({
      appointmentId: appointment._id,
      patientId: appointment.patientId,
      patientName: appointment.patientName,
      rating: normalizedRating,
      comment: normalizedComment,
      createdAt: reviewCreatedAt
    });

    const ratingSummary = getDoctorRatingSummaryFromReviews(doctor.reviews);
    doctor.totalReviews = ratingSummary.totalReviews;
    doctor.averageRating = ratingSummary.averageRating;
    await doctor.save();

    return res.status(200).json({
      message: 'Review submitted successfully'
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not submit review', error: error.message });
  }
};

export const skipPatientAppointmentReview = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const confirmSkip = Boolean(req.body?.confirmSkip);

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment id' });
    }

    if (!confirmSkip) {
      return res.status(400).json({ message: 'Please confirm before skipping this review' });
    }

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patientId: req.user?.id,
      bookingStatus: 'confirmed',
      paymentStatus: 'succeeded'
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const reviewStatus = normalizeAppointmentReviewStatus(appointment);

    if (reviewStatus === 'submitted') {
      return res.status(409).json({ message: 'You already reviewed this appointment' });
    }

    if (reviewStatus === 'skipped') {
      return res.status(200).json({ message: 'Review already skipped for this appointment' });
    }

    if (!isAppointmentReviewEligible(appointment)) {
      return res.status(400).json({ message: 'This appointment is not ready for review yet' });
    }

    appointment.reviewStatus = 'skipped';
    appointment.reviewRating = null;
    appointment.reviewComment = '';
    appointment.reviewedAt = null;
    appointment.reviewSkippedAt = new Date();
    appointment.reviewSkipConfirmed = true;
    await appointment.save();

    return res.status(200).json({
      message: 'Review skipped. You cannot rate this appointment again.'
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not skip review', error: error.message });
  }
};
