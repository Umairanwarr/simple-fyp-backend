import mongoose from 'mongoose';
import { StoreOrder } from './src/models/StoreOrder.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const reviews = await StoreOrder.find({ reviewStatus: 'submitted' });
  console.log('Submitted reviews count:', reviews.length);
  if(reviews.length > 0) {
    console.log('Sample review:', {
      id: reviews[0]._id,
      storeId: reviews[0].storeId,
      reviewStatus: reviews[0].reviewStatus,
      reviewRating: reviews[0].reviewRating,
      reviewComment: reviews[0].reviewComment
    });
  }
  process.exit(0);
});
