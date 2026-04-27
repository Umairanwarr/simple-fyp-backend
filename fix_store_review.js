import mongoose from 'mongoose';
import { StoreOrder } from './src/models/StoreOrder.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const targetStoreId = '69dfc4bcfe5b0470c9dce8fa';
  const order = await StoreOrder.findOne({ reviewStatus: 'submitted' });
  if(order) {
    // If the review is not for the currently logged in store, let's copy it or move it
    // Moving it might break the original store's data, let's just create a dummy order with a review for the target store
    await StoreOrder.create({
      storeId: targetStoreId,
      patientName: 'Test User',
      patientPhone: '1234567890',
      patientEmail: 'test@example.com',
      totalAmount: 1500,
      status: 'completed',
      reviewStatus: 'submitted',
      reviewRating: 5,
      reviewComment: 'Excellent service and quick delivery!',
      reviewedAt: new Date()
    });
    console.log('Test review added for store:', targetStoreId);
  }
  process.exit(0);
});
