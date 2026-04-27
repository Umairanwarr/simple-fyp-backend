import mongoose from 'mongoose';
import { MedicalStore } from './src/models/MedicalStore.js';
import { StoreOrder } from './src/models/StoreOrder.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const stores = await MedicalStore.find({});
  for (const store of stores) {
    const orders = await StoreOrder.find({ storeId: store._id, status: 'completed' });
    const totalEarnings = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    store.totalEarningsInRupees = totalEarnings;
    await store.save();
    console.log(`Store ${store._id} earnings set to ${totalEarnings}`);
  }
  process.exit(0);
});
