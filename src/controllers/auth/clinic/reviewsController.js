import { Clinic } from '../../../models/Clinic.js';

const mapClinicReview = (review) => ({
  id: String(review?._id || ''),
  appointmentId: String(review?.appointmentId || ''),
  patientName: String(review?.patientName || '').trim() || 'Patient',
  doctorName: String(review?.doctorName || '').trim(),
  rating: Math.max(1, Math.min(5, Math.trunc(Number(review?.rating || 0)) || 0)),
  comment: String(review?.comment || '').trim(),
  createdAt: review?.createdAt || null
});

export const getClinicReviews = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.user?.id)
      .select('reviews averageRating totalReviews')
      .lean();

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    const reviews = (Array.isArray(clinic.reviews) ? clinic.reviews : [])
      .map((review) => mapClinicReview(review))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return res.status(200).json({
      reviews,
      averageRating: Number(Number(clinic.averageRating || 0).toFixed(2)),
      totalReviews: Math.max(0, Math.trunc(Number(clinic.totalReviews || 0)))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch clinic reviews', error: error.message });
  }
};
