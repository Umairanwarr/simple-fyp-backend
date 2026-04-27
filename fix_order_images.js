import mongoose from 'mongoose';
import { StoreOrder } from './src/models/StoreOrder.js';
import { Patient } from './src/models/Patient.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const orders = await StoreOrder.find({ patientId: { $exists: true } });
  let count = 0;
  for (const order of orders) {
    if (!order.patientImage) {
      const patient = await Patient.findById(order.patientId).lean();
      if (patient && patient.avatarDocument && patient.avatarDocument.url) {
        order.patientImage = patient.avatarDocument.url;
        await order.save();
        count++;
      }
    }
  }
  console.log(`Updated ${count} orders with patient images`);
  process.exit(0);
});
