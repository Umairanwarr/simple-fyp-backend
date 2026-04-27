import { MedicalStore } from '../../../models/MedicalStore.js';

export const getStoreReviews = async (req, res) => {
  try {
    const storeId = req.user?.id;
    if (!storeId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const store = await MedicalStore.findById(storeId)
      .select('reviews totalReviews averageRating')
      .lean();

    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    const rawReviews = Array.isArray(store.reviews) ? store.reviews : [];

    const reviews = rawReviews.map(review => ({
      id: review._id,
      patientName: review.patientName,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt
    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.status(200).json({
      totalReviews: store.totalReviews || reviews.length,
      averageRating: Number((store.averageRating || 0).toFixed(2)),
      reviews
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch store reviews', error: error.message });
  }
};
