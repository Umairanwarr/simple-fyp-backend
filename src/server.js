import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chatRoutes.js';
import agoraRoutes from './routes/agoraRoutes.js';
import liveStreamRoutes from './routes/liveStreamRoutes.js';
import { LiveStream } from './models/LiveStream.js';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Server as IOServer } from 'socket.io';
import ChatMessage from './models/ChatMessage.js';
import { Doctor } from './models/Doctor.js';
import { Patient } from './models/Patient.js';
import { sendNewChatMessageEmail } from './services/mailService.js';
import { hasActiveChatSession } from './routes/chatRoutes.js';

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
app.use('/api/agora', agoraRoutes);
app.use('/api/livestream', liveStreamRoutes);

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

          if (!(await hasActiveChatSession(fromId, to))) {
            if (typeof ack === 'function') ack({ ok: false, message: 'Cannot chat without an active or upcoming appointment' });
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

          // Send email notification offline (fire and forget)
          try {
            const SenderModel = fromModel === 'Doctor' ? Doctor : Patient;
            const RecipientModel = toModel === 'Doctor' ? Doctor : Patient;
            
            const [senderDoc, recipientDoc] = await Promise.all([
              SenderModel.findById(fromId).select(fromModel === 'Doctor' ? 'fullName' : 'firstName lastName').lean(),
              RecipientModel.findById(to).select(toModel === 'Doctor' ? 'email fullName' : 'email firstName lastName').lean()
            ]);

            if (senderDoc && recipientDoc && recipientDoc.email) {
              const senderName = fromModel === 'Doctor' ? senderDoc.fullName : `${senderDoc.firstName} ${senderDoc.lastName}`;
              const recipientName = toModel === 'Doctor' ? recipientDoc.fullName : `${recipientDoc.firstName} ${recipientDoc.lastName}`;
              await sendNewChatMessageEmail({
                to: recipientDoc.email,
                recipientName,
                senderName,
                senderRole: fromModel.toLowerCase(),
                messagePreview: content.length > 50 ? content.substring(0, 47) + '...' : content
              });
            }
          } catch (emailErr) {
            console.error('Failed to send chat email notification:', emailErr);
          }
        } catch (err) {
          if (typeof ack === 'function') ack({ ok: false, message: err.message });
        }
      });

      // Video Call Signaling
      socket.on('call:initiate', (payload, ack) => {
        try {
          const fromId = String(socket.user.id || '').trim();
          const to = String(payload?.to || '').trim();
          const channelName = String(payload?.channelName || '').trim();
          const callerName = String(payload?.callerName || 'Doctor').trim();
          const callerAvatar = String(payload?.callerAvatar || '').trim();
          
          if (!to || !channelName) {
            if (typeof ack === 'function') ack({ ok: false });
            return;
          }

          io.to(`user:${to}`).emit('call:incoming', {
            channelName,
            callerId: fromId,
            callerName,
            callerAvatar
          });

          if (typeof ack === 'function') ack({ ok: true });
        } catch (err) {
          if (typeof ack === 'function') ack({ ok: false });
        }
      });

      socket.on('call:accept', (payload) => {
        const to = String(payload?.to || '');
        if (to) io.to(`user:${to}`).emit('call:accepted', { patientId: socket.user.id });
      });

      socket.on('call:reject', (payload) => {
        const to = String(payload?.to || '');
        if (to) io.to(`user:${to}`).emit('call:rejected', { patientId: socket.user.id });
      });

      socket.on('call:end', (payload) => {
        const to = String(payload?.to || '');
        if (to) io.to(`user:${to}`).emit('call:ended');
      });

      // ─── Live Stream Signaling ───
      socket.on('livestream:join', (payload) => {
        const channelName = String(payload?.channelName || '').trim();
        if (channelName) {
          socket.join(`stream:${channelName}`);
          const room = io.sockets.adapter.rooms.get(`stream:${channelName}`);
          const viewerCount = room ? room.size : 0;
          io.to(`stream:${channelName}`).emit('livestream:viewer-count', { channelName, viewerCount });

          LiveStream.findOneAndUpdate(
            { channelName },
            { $set: { viewerCount }, $max: { maxViewers: viewerCount } }
          ).catch(() => {});
        }
      });

      socket.on('livestream:leave', (payload) => {
        const channelName = String(payload?.channelName || '').trim();
        if (channelName) {
          socket.leave(`stream:${channelName}`);
          const room = io.sockets.adapter.rooms.get(`stream:${channelName}`);
          const viewerCount = room ? room.size : 0;
          io.to(`stream:${channelName}`).emit('livestream:viewer-count', { channelName, viewerCount });

          LiveStream.findOneAndUpdate(
            { channelName },
            { $set: { viewerCount } }
          ).catch(() => {});
        }
      });

      socket.on('livestream:invite-guest', (payload) => {
        const to = String(payload?.guestId || '').trim();
        if (to) {
          io.to(`user:${to}`).emit('livestream:guest-invite', {
            streamId: payload.streamId,
            channelName: payload.channelName,
            hostName: payload.hostName,
            title: payload.title
          });
        }
      });

      socket.on('livestream:end', (payload) => {
        const channelName = String(payload?.channelName || '').trim();
        if (channelName) {
          io.to(`stream:${channelName}`).emit('livestream:ended', { channelName });
        }
      });

      socket.on('livestream:request-cohost', (payload) => {
        const channelName = String(payload?.channelName || '').trim();
        if (channelName) {
          io.to(`stream:${channelName}`).emit('livestream:cohost-request', {
            viewerId: socket.user.id,
            viewerName: payload.viewerName || 'A viewer',
            streamId: payload.streamId
          });
        }
      });

      socket.on('livestream:accept-cohost', (payload) => {
        const channelName = String(payload?.channelName || '').trim();
        if (channelName) {
          io.to(`stream:${channelName}`).emit('livestream:cohost-accepted', {
            viewerId: payload.viewerId,
            viewerName: payload.viewerName
          });
        }
      });

      socket.on('livestream:reject-cohost', (payload) => {
        const channelName = String(payload?.channelName || '').trim();
        if (channelName) {
          io.to(`stream:${channelName}`).emit('livestream:cohost-rejected', {
            viewerId: payload.viewerId
          });
        }
      });

      socket.on('livestream:remove-cohost', (payload) => {
        const channelName = String(payload?.channelName || '').trim();
        if (channelName) {
          io.to(`stream:${channelName}`).emit('livestream:cohost-removed', {
            viewerId: payload.viewerId
          });
        }
      });

      socket.on('livestream:chat', (payload) => {
        const channelName = String(payload?.channelName || '').trim();
        if (channelName) {
          io.to(`stream:${channelName}`).emit('livestream:chat-message', {
            senderId: socket.user.id,
            senderName: payload.senderName || 'Anonymous',
            message: String(payload.message || '').trim(),
            timestamp: new Date().toISOString()
          });
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
