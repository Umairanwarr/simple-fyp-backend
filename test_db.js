import mongoose from 'mongoose';
import { MedicalStore } from './src/models/MedicalStore.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const store = await MedicalStore.findOne({});
  console.log('Store Bank Account:', store.bankAccount);
  process.exit(0);
});
