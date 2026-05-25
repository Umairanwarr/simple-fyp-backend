import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import ChatMessage from '../models/ChatMessage.js';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';
import { Appointment } from '../models/Appointment.js';
import { sendNewChatMessageEmail } from '../services/mailService.js';
import { uploadChatMediaToCloudinary } from '../services/cloudinaryService.js';
import { decryptChatMessageRecord, encryptChatPayload } from '../utils/chatCrypto.js';

// Multer for chat media (images + videos, max 25MB)
const chatMediaStorage = multer.memoryStorage();
const chatMediaUpload = multer({
  storage: chatMediaStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mime = String(file?.mimetype || '').toLowerCase();
    const allowed = mime.startsWith('image/') || mime.startsWith('video/');
    allowed ? cb(null, true) : cb(new Error('Only images and videos are allowed'));
  }
}).single('media');

const parseAppointmentDateTimeChat = (date, time) => {
  const parsedDate = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsedDate.getTime())) return null;
  return parsedDate;
};

const isAppointmentConsultationEnded = (appointmentRecord, now = new Date()) => {
  const consultationEndedAtTimestamp = appointmentRecord?.consultationEndedAt
    ? new Date(appointmentRecord.consultationEndedAt).getTime()
    : 0;

  if (!Number.isFinite(consultationEndedAtTimestamp) || consultationEndedAtTimestamp <= 0) {
    return false;
  }

  return consultationEndedAtTimestamp <= now.getTime();
};

const isAppointmentChatWindowOpen = (appointmentRecord, now = new Date()) => {
  if (isAppointmentConsultationEnded(appointmentRecord, now)) {
    return false;
  }

  const start = parseAppointmentDateTimeChat(appointmentRecord?.appointmentDate, appointmentRecord?.fromTime);
  const end = parseAppointmentDateTimeChat(appointmentRecord?.appointmentDate, appointmentRecord?.toTime);

  if (!start || !end) {
    return false;
  }

  const nowTimestamp = now.getTime();
  return nowTimestamp >= start.getTime() && nowTimestamp < end.getTime();
};

export const hasActiveChatSession = async (user1Id, user2Id) => {
  const appointments = await Appointment.find({
    $or: [
      { doctorId: user1Id, patientId: user2Id },
      { doctorId: user2Id, patientId: user1Id }
    ],
    bookingStatus: 'confirmed',
    paymentStatus: 'succeeded'
  }).lean();

  const now = new Date();
  
  for (const appt of appointments) {
    if (isAppointmentChatWindowOpen(appt, now)) {
      return true;
    }
  }
  return false;
};

const router = express.Router();

const ROLE_TO_MODEL = {
  doctor: 'Doctor',
  patient: 'Patient',
  clinic: 'Clinic',
  'medical-store': 'MedicalStore'
};

const getPartnerInfoFor = async (id, modelName) => {
  try {
    if (!id) return { name: '', avatarUrl: '', plan: '' };

    if (modelName === 'Doctor') {
      const d = await Doctor.findById(id).lean();
      if (!d) return { name: '', avatarUrl: '', plan: '' };
      return {
        name: String(d.fullName || ''),
        avatarUrl: String(d.avatarDocument?.url || ''),
        plan: String(d.currentPlan || 'platinum')
      };
    }

    if (modelName === 'Patient') {
      const p = await Patient.findById(id).lean();
      if (!p) return { name: '', avatarUrl: '', plan: '' };
      return {
        name: `${String(p.firstName || '')} ${String(p.lastName || '')}`.trim(),
        avatarUrl: String(p.avatarDocument?.url || ''),
        plan: ''
      };
    }

    return { name: '', avatarUrl: '', plan: '' };
  } catch (err) {
    return { name: '', avatarUrl: '', plan: '' };
  }
};

// Get partner info (name + avatar) by ID — used when no existing conversation exists
router.get('/partner/:partnerId', requireRoleAuth(), async (req, res) => {
  try {
    const partnerId = String(req.params.partnerId || '').trim();

    if (!partnerId) {
      return res.status(400).json({ message: 'Missing partnerId' });
    }

    // Try Doctor first
    const doctor = await Doctor.findById(partnerId).select('fullName avatarDocument').lean();
    if (doctor) {
      return res.json({
        partnerId,
        partnerName: String(doctor.fullName || '').trim(),
        partnerAvatar: String(doctor.avatarDocument?.url || '').trim()
      });
    }

    // Try Patient
    const patient = await Patient.findById(partnerId).select('firstName lastName avatarDocument').lean();
    if (patient) {
      const name = `${String(patient.firstName || '')} ${String(patient.lastName || '')}`.trim();
      return res.json({
        partnerId,
        partnerName: name,
        partnerAvatar: String(patient.avatarDocument?.url || '').trim()
      });
    }

    return res.status(404).json({ message: 'Partner not found' });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch partner info' });
  }
});

// Get messages between authenticated user and other user
router.get('/messages/:otherUserId', requireRoleAuth(), async (req, res) => {
  try {
    const userId = String(req.user.id || '').trim();
    const otherId = String(req.params.otherUserId || '').trim();

    if (!userId || !otherId) {
      return res.status(400).json({ message: 'Missing user id' });
    }

    // Mark messages sent to this user as read
    await ChatMessage.updateMany(
      { to: new mongoose.Types.ObjectId(userId), from: new mongoose.Types.ObjectId(otherId), readAt: null },
      { $set: { readAt: new Date() } }
    );

    const messages = await ChatMessage.find({
      $or: [
        { from: new mongoose.Types.ObjectId(userId), to: new mongoose.Types.ObjectId(otherId) },
        { from: new mongoose.Types.ObjectId(otherId), to: new mongoose.Types.ObjectId(userId) }
      ]
    })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ messages: messages.map((message) => decryptChatMessageRecord(message)) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch messages' });
  }
});

// Conversations list (last message per partner)
router.get('/conversations', requireRoleAuth(), async (req, res) => {
  try {
    const userIdString = String(req.user.id || '').trim();
    const role = String(req.user.role || '').trim().toLowerCase();

    if (!mongoose.Types.ObjectId.isValid(userIdString)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const userId = new mongoose.Types.ObjectId(userIdString);

    const agg = await ChatMessage.aggregate([
      { $match: { $or: [{ from: userId }, { to: userId }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ['$from', userId] }, '$to', '$from']
          },
          lastMessage: { $first: '$$ROOT' }
        }
      },
      { $replaceRoot: { newRoot: { partnerId: '$_id', lastMessage: '$lastMessage' } } }
    ]).allowDiskUse(true);

    const conversationMap = new Map();

    for (const row of agg) {
      const partnerId = String(row.partnerId || '').trim();
      if (!partnerId || !mongoose.Types.ObjectId.isValid(partnerId)) {
        continue;
      }

      const last = row.lastMessage || {};
      const lastFrom = last.from ? String(last.from) : '';
      const partnerModel = lastFrom === String(userId) ? last.toModel : last.fromModel;

      if (!(await hasActiveChatSession(userId, partnerId))) {
        continue;
      }

      const partnerInfo = await getPartnerInfoFor(partnerId, partnerModel);

      const unreadCount = await ChatMessage.countDocuments({
        from: new mongoose.Types.ObjectId(partnerId),
        to: new mongoose.Types.ObjectId(userId),
        readAt: null
      });

      conversationMap.set(partnerId, {
        partnerId,
        partnerModel,
        partnerName: partnerInfo.name,
        partnerAvatar: partnerInfo.avatarUrl,
        partnerPlan: partnerInfo.plan,
        lastMessage: decryptChatMessageRecord(last),
        unreadCount
      });
    }

    if (role === 'patient') {
      const activeAppointments = await Appointment.find({
        patientId: userId,
        bookingStatus: 'confirmed',
        paymentStatus: 'succeeded'
      })
        .select('doctorId doctorName doctorAvatarUrl appointmentDate fromTime toTime consultationEndedAt')
        .sort({ appointmentDate: 1, toTime: 1 })
        .lean();

      const now = new Date();
      const activeDoctorConversationMap = new Map();

      for (const appointment of activeAppointments) {
        if (!isAppointmentChatWindowOpen(appointment, now)) {
          continue;
        }

        const doctorId = String(appointment?.doctorId || '').trim();
        if (!doctorId || !mongoose.Types.ObjectId.isValid(doctorId)) {
          continue;
        }
        if (conversationMap.has(doctorId) || activeDoctorConversationMap.has(doctorId)) {
          continue;
        }

        activeDoctorConversationMap.set(doctorId, {
          partnerId: doctorId,
          partnerModel: 'Doctor',
          partnerName: String(appointment?.doctorName || '').trim(),
          partnerAvatar: String(appointment?.doctorAvatarUrl || '').trim(),
          partnerPlan: '',
          lastMessage: null,
          unreadCount: 0
        });
      }

      if (activeDoctorConversationMap.size > 0) {
        const doctorIds = Array.from(activeDoctorConversationMap.keys());
        const doctors = await Doctor.find({
          _id: { $in: doctorIds.map((id) => new mongoose.Types.ObjectId(id)) }
        })
          .select('fullName avatarDocument currentPlan')
          .lean();

        const doctorMap = new Map(
          doctors.map((doctor) => [String(doctor?._id || '').trim(), doctor])
        );

        for (const [doctorId, conversation] of activeDoctorConversationMap.entries()) {
          const doctor = doctorMap.get(doctorId);
          if (doctor) {
            if (!conversation.partnerName) {
              conversation.partnerName = String(doctor.fullName || '').trim();
            }
            if (!conversation.partnerAvatar) {
              conversation.partnerAvatar = String(doctor.avatarDocument?.url || '').trim();
            }
            conversation.partnerPlan = String(doctor.currentPlan || 'platinum').trim();
          }

          conversationMap.set(doctorId, conversation);
        }
      }
    }

    const results = Array.from(conversationMap.values()).sort((firstConversation, secondConversation) => {
      const firstTimestamp = firstConversation?.lastMessage?.createdAt
        ? new Date(firstConversation.lastMessage.createdAt).getTime()
        : 0;
      const secondTimestamp = secondConversation?.lastMessage?.createdAt
        ? new Date(secondConversation.lastMessage.createdAt).getTime()
        : 0;

      if (firstTimestamp !== secondTimestamp) {
        return secondTimestamp - firstTimestamp;
      }

      return String(firstConversation?.partnerName || '').localeCompare(String(secondConversation?.partnerName || ''));
    });

    return res.json({ conversations: results });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch conversations' });
  }
});

// send message via REST fallback
router.post('/messages', requireRoleAuth(), async (req, res) => {
  try {
    const userId = String(req.user.id || '').trim();
    const role = String(req.user.role || '').trim();
    const to = String(req.body.to || '').trim();
    const content = String(req.body.content || '').trim();
    const attachment = req.body.attachment || null;

    if (!userId || !to || (!content && !attachment)) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    if (!(await hasActiveChatSession(userId, to))) {
      return res.status(403).json({ message: 'Cannot chat unless the appointment is ongoing' });
    }

    const fromModel = ROLE_TO_MODEL[role] || 'Patient';
    // guess partner model as the inverse (if sending patient->doctor etc) - caller should set proper models
    const toModel = fromModel === 'Doctor' ? 'Patient' : 'Doctor';

    const encryptedPayload = encryptChatPayload({ content, attachment: attachment || {} });

    const message = await ChatMessage.create({
      from: new mongoose.Types.ObjectId(userId),
      to: new mongoose.Types.ObjectId(to),
      fromModel,
      toModel,
      content: encryptedPayload.content,
      attachment: encryptedPayload.attachment
    });

    try {
      const SenderModel = fromModel === 'Doctor' ? Doctor : Patient;
      const RecipientModel = toModel === 'Doctor' ? Doctor : Patient;
      
      const [senderDoc, recipientDoc] = await Promise.all([
        SenderModel.findById(userId).select(fromModel === 'Doctor' ? 'fullName' : 'firstName lastName').lean(),
        RecipientModel.findById(to).select(toModel === 'Doctor' ? 'email fullName' : 'email firstName lastName').lean()
      ]);

      if (senderDoc && recipientDoc && recipientDoc.email) {
        const senderName = fromModel === 'Doctor' ? senderDoc.fullName : `${senderDoc.firstName} ${senderDoc.lastName}`;
        const recipientName = toModel === 'Doctor' ? recipientDoc.fullName : `${recipientDoc.firstName} ${recipientDoc.lastName}`;
        sendNewChatMessageEmail({
          to: recipientDoc.email,
          recipientName,
          senderName,
          senderRole: fromModel.toLowerCase(),
          messagePreview: content.length > 50 ? content.substring(0, 47) + '...' : content
        }).catch(err => console.error('Failed to send chat email notification:', err));
      }
    } catch (emailErr) {
      console.error('Failed to prepare chat email notification:', emailErr);
    }

    return res.status(201).json({ message: decryptChatMessageRecord(message) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not send message' });
  }
});

// Upload media for chat (shared by doctor-patient and store chats)
router.post('/upload-media', requireRoleAuth(), (req, res, next) => {
  chatMediaUpload(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Upload failed' });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const result = await uploadChatMediaToCloudinary(req.file);
    const mime = String(req.file.mimetype || '').toLowerCase();
    return res.json({
      url: result.url,
      type: mime.startsWith('video/') ? 'video' : 'image',
      originalName: result.originalName
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not upload media' });
  }
});

export default router;
