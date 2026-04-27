import mongoose from 'mongoose';
import { StoreOrder } from './src/models/StoreOrder.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  await StoreOrder.deleteMany({ patientName: 'Test User' });
  console.log('Deleted fake reviews');
  process.exit(0);
});
