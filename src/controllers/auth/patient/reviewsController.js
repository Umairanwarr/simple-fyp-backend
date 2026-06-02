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
import { Clinic } from '../../../models/Clinic.js';
import { ClinicDoctorAppointment } from '../../../models/ClinicDoctorAppointment.js';
import { sendClinicReviewSubmittedEmail } from '../../../services/mailService.js';

const mapPendingClinicReviewAppointment = (appointmentRecord) => ({
  id: String(appointmentRecord?._id || ''),
  type: 'clinic',
  appointmentDate: String(appointmentRecord?.appointmentDate || '').trim(),
  fromTime: String(appointmentRecord?.fromTime || '').trim(),
  toTime: String(appointmentRecord?.toTime || '').trim(),
  amountInRupees: Math.max(0, Math.trunc(Number(appointmentRecord?.amountInRupees || 0))),
  clinic: {
    id: String(appointmentRecord?.clinicId || ''),
    name: String(appointmentRecord?.clinicName || '').trim() || 'Clinic'
  },
  doctor: {
    id: String(appointmentRecord?.doctorId || ''),
    name: String(appointmentRecord?.doctorName || '').trim() || 'Clinic Doctor',
    image: String(appointmentRecord?.doctorAvatarUrl || '').trim() || '/topdoc.svg'
  }
});

export const getPatientPendingReviewAppointment = async (req, res) => {
  try {
    const [appointments, clinicAppointments] = await Promise.all([
      Appointment.find({
        patientId: req.user?.id,
        bookingStatus: 'confirmed',
        paymentStatus: 'succeeded',
        reviewStatus: 'pending'
      })
        .select('doctorId doctorName doctorAvatarUrl appointmentDate fromTime toTime amountInRupees bookingStatus paymentStatus reviewStatus consultationEndedAt')
        .sort({ appointmentDate: 1, toTime: 1, createdAt: 1 })
        .lean(),
      ClinicDoctorAppointment.find({
        patientId: req.user?.id,
        bookingStatus: 'confirmed',
        paymentStatus: 'succeeded',
        $or: [
          { reviewStatus: 'pending' },
          { reviewStatus: { $exists: false } }
        ]
      })
        .select('clinicId clinicName doctorId doctorName doctorAvatarUrl appointmentDate fromTime toTime amountInRupees bookingStatus paymentStatus reviewStatus')
        .sort({ appointmentDate: 1, toTime: 1, createdAt: 1 })
        .lean()
    ]);

    const now = new Date();
    const pendingDoctorReview = appointments.find((appointment) => isAppointmentReviewEligible(appointment, now));
    const pendingClinicReview = clinicAppointments.find((appointment) => isAppointmentReviewEligible(appointment, now));
    const pendingReviewAppointment = pendingDoctorReview
      ? mapPendingReviewAppointment(pendingDoctorReview)
      : pendingClinicReview
        ? mapPendingClinicReviewAppointment(pendingClinicReview)
        : null;

    return res.status(200).json({
      appointment: pendingReviewAppointment
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
      const clinicAppointment = await ClinicDoctorAppointment.findOne({
        _id: appointmentId,
        patientId: req.user?.id,
        bookingStatus: 'confirmed',
        paymentStatus: 'succeeded'
      });

      if (!clinicAppointment) {
        return res.status(404).json({ message: 'Appointment not found' });
      }

      const reviewStatus = normalizeAppointmentReviewStatus(clinicAppointment);
      if (reviewStatus === 'submitted') return res.status(409).json({ message: 'You already rated this appointment' });
      if (reviewStatus === 'skipped') return res.status(409).json({ message: 'You skipped this appointment review and cannot rate it now' });
      if (!isAppointmentReviewEligible(clinicAppointment)) {
        return res.status(400).json({ message: 'You can review this appointment only after it is completed' });
      }

      const clinic = await Clinic.findById(clinicAppointment.clinicId).select('name email reviews averageRating totalReviews');
      if (!clinic) return res.status(404).json({ message: 'Clinic not found' });

      const reviewCreatedAt = new Date();
      clinicAppointment.reviewStatus = 'submitted';
      clinicAppointment.reviewRating = normalizedRating;
      clinicAppointment.reviewComment = normalizedComment;
      clinicAppointment.reviewedAt = reviewCreatedAt;
      clinicAppointment.reviewSkippedAt = null;
      clinicAppointment.reviewSkipConfirmed = false;
      await clinicAppointment.save();

      clinic.reviews.push({
        appointmentId: clinicAppointment._id,
        patientId: clinicAppointment.patientId,
        patientName: clinicAppointment.patientName,
        doctorName: clinicAppointment.doctorName,
        rating: normalizedRating,
        comment: normalizedComment,
        createdAt: reviewCreatedAt
      });
      const ratingSummary = getDoctorRatingSummaryFromReviews(clinic.reviews);
      clinic.totalReviews = ratingSummary.totalReviews;
      clinic.averageRating = ratingSummary.averageRating;
      await clinic.save();

      if (clinic.email) {
        await sendClinicReviewSubmittedEmail({
          to: clinic.email,
          clinicName: clinic.name,
          patientName: clinicAppointment.patientName,
          rating: normalizedRating,
          comment: normalizedComment
        }).catch(() => {});
      }

      return res.status(200).json({ message: 'Review submitted successfully' });
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
      const clinicAppointment = await ClinicDoctorAppointment.findOne({
        _id: appointmentId,
        patientId: req.user?.id,
        bookingStatus: 'confirmed',
        paymentStatus: 'succeeded'
      });

      if (!clinicAppointment) return res.status(404).json({ message: 'Appointment not found' });

      const reviewStatus = normalizeAppointmentReviewStatus(clinicAppointment);
      if (reviewStatus === 'submitted') return res.status(409).json({ message: 'You already reviewed this appointment' });
      if (reviewStatus === 'skipped') return res.status(200).json({ message: 'Review already skipped for this appointment' });
      if (!isAppointmentReviewEligible(clinicAppointment)) {
        return res.status(400).json({ message: 'This appointment is not ready for review yet' });
      }

      clinicAppointment.reviewStatus = 'skipped';
      clinicAppointment.reviewRating = null;
      clinicAppointment.reviewComment = '';
      clinicAppointment.reviewedAt = null;
      clinicAppointment.reviewSkippedAt = new Date();
      clinicAppointment.reviewSkipConfirmed = true;
      await clinicAppointment.save();

      return res.status(200).json({ message: 'Review skipped. You cannot rate this appointment again.' });
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
