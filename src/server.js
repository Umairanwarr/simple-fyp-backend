import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chatRoutes.js';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Server as IOServer } from 'socket.io';
import ChatMessage from './models/ChatMessage.js';

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
app.use('/api/chat', chatRoutes);

const startServer = async () => {
  await connectDB();

  const server = http.createServer(app);

  const allowedOrigins = process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:5173'];

  const io = new IOServer(server, {
    cors: {
      origin: allowedOrigins
    }
  });

  const ROLE_TO_MODEL = {
    doctor: 'Doctor',
    patient: 'Patient',
    clinic: 'Clinic',
    'medical-store': 'MedicalStore'
  };

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || (socket.handshake.headers?.authorization || '').split(' ')[1];

      if (!token) {
        return next(new Error('Unauthorized'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      socket.user = decoded;
      return next();
    } catch (err) {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    try {
      const user = socket.user || {};
      const userId = String(user.id || '').trim();
      if (userId) {
        socket.join(`user:${userId}`);
      }

      socket.on('chat:send', async (payload, ack) => {
        try {
          const fromId = String(socket.user.id || '').trim();
          const role = String(socket.user.role || '').trim();
          const to = String(payload?.to || '').trim();
          const content = String(payload?.content || '').trim();
          const attachment = payload?.attachment || null;

          if (!fromId || !to || (!content && !attachment)) {
            if (typeof ack === 'function') ack({ ok: false, message: 'Invalid payload' });
            return;
          }

          const fromModel = ROLE_TO_MODEL[role] || 'Patient';
          const toModel = fromModel === 'Doctor' ? 'Patient' : 'Doctor';

          const message = await ChatMessage.create({
            from: fromId,
            to,
            fromModel,
            toModel,
            content,
            attachment: attachment || {}
          });

          const out = {
            id: message._id,
            from: message.from,
            to: message.to,
            fromModel: message.fromModel,
            toModel: message.toModel,
            content: message.content,
            attachment: message.attachment,
            createdAt: message.createdAt
          };

          // emit to both sender and receiver rooms
          io.to(`user:${to}`).emit('chat:message', out);
          io.to(`user:${fromId}`).emit('chat:message', out);

          if (typeof ack === 'function') ack({ ok: true, message: out });
        } catch (err) {
          if (typeof ack === 'function') ack({ ok: false, message: err.message });
        }
      });
    } catch (err) {
      // ignore
    }
  });

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
