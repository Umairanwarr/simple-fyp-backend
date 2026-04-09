import {
  Doctor,
  mapDoctorReviewRecord,
  toDateTimestamp
} from './shared.js';

export const getDoctorReviews = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user?.id)
      .select('reviews averageRating totalReviews')
      .lean();

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const reviews = Array.isArray(doctor.reviews)
      ? doctor.reviews
          .map((review) => mapDoctorReviewRecord(review))
          .sort((firstReview, secondReview) => {
            return toDateTimestamp(secondReview.createdAt) - toDateTimestamp(firstReview.createdAt);
          })
      : [];

    return res.status(200).json({
      totalReviews: Math.max(0, Math.trunc(Number(doctor.totalReviews || reviews.length || 0))),
      averageRating: Number(Number(doctor.averageRating || 0).toFixed(2)),
      reviews
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch doctor reviews', error: error.message });
  }
};
