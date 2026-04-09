import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';

const currentFilePath = fileURLToPath(import.meta.url);
const srcDirectory = path.dirname(currentFilePath);
const backendRootDirectory = path.resolve(srcDirectory, '..');

dotenv.config({ path: path.resolve(backendRootDirectory, '.env') });

if (!process.env.STRIPE_SECRET_KEY) {
  dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });
}

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.CLIENT_ORIGIN 
  ? process.env.CLIENT_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173'];

app.use(
  cors({
    origin: allowedOrigins
  })
);
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Backend is running' });
});

app.use('/api/auth', authRoutes);

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
