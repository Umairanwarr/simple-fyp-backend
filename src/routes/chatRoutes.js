import express from 'express';
import mongoose from 'mongoose';
import ChatMessage from '../models/ChatMessage.js';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';
import { Appointment } from '../models/Appointment.js';
import { sendNewChatMessageEmail } from '../services/mailService.js';

const parseAppointmentDateTimeChat = (date, time) => {
  const parsedDate = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsedDate.getTime())) return null;
  return parsedDate;
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
    const end = parseAppointmentDateTimeChat(appt.appointmentDate, appt.toTime);
    // If the appointment's end time hasn't passed, they can chat.
    if (!end || now.getTime() < end.getTime()) {
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

    return res.json({ messages });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch messages' });
  }
});

// Conversations list (last message per partner)
router.get('/conversations', requireRoleAuth(), async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(String(req.user.id || '').trim());

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

    const results = [];

    for (const row of agg) {
      const partnerId = String(row.partnerId || '').trim();
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

      results.push({
        partnerId,
        partnerModel,
        partnerName: partnerInfo.name,
        partnerAvatar: partnerInfo.avatarUrl,
        partnerPlan: partnerInfo.plan,
        lastMessage: last,
        unreadCount
      });
    }

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
      return res.status(403).json({ message: 'Cannot chat without an active or upcoming appointment' });
    }

    const fromModel = ROLE_TO_MODEL[role] || 'Patient';
    // guess partner model as the inverse (if sending patient->doctor etc) - caller should set proper models
    const toModel = fromModel === 'Doctor' ? 'Patient' : 'Doctor';

    const message = await ChatMessage.create({
      from: new mongoose.Types.ObjectId(userId),
      to: new mongoose.Types.ObjectId(to),
      fromModel,
      toModel,
      content,
      attachment: attachment || {}
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

    return res.status(201).json({ message });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not send message' });
  }
});

export default router;
