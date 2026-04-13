import express from 'express';
import mongoose from 'mongoose';
import ChatMessage from '../models/ChatMessage.js';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';

const router = express.Router();

const ROLE_TO_MODEL = {
  doctor: 'Doctor',
  patient: 'Patient',
  clinic: 'Clinic',
  'medical-store': 'MedicalStore'
};

const getDisplayNameFor = async (id, modelName) => {
  try {
    if (!id) return '';

    if (modelName === 'Doctor') {
      const d = await Doctor.findById(id).lean();
      return d ? String(d.fullName || '') : '';
    }

    if (modelName === 'Patient') {
      const p = await Patient.findById(id).lean();
      if (!p) return '';
      return `${String(p.firstName || '')} ${String(p.lastName || '')}`.trim();
    }

    return '';
  } catch (err) {
    return '';
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

    const messages = await ChatMessage.find({
      $or: [
        { from: mongoose.Types.ObjectId(userId), to: mongoose.Types.ObjectId(otherId) },
        { from: mongoose.Types.ObjectId(otherId), to: mongoose.Types.ObjectId(userId) }
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
    const userId = mongoose.Types.ObjectId(String(req.user.id || '').trim());

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

      const displayName = await getDisplayNameFor(partnerId, partnerModel);

      results.push({
        partnerId,
        partnerModel,
        partnerName: displayName,
        lastMessage: last
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

    const fromModel = ROLE_TO_MODEL[role] || 'Patient';
    // guess partner model as the inverse (if sending patient->doctor etc) - caller should set proper models
    const toModel = fromModel === 'Doctor' ? 'Patient' : 'Doctor';

    const message = await ChatMessage.create({
      from: mongoose.Types.ObjectId(userId),
      to: mongoose.Types.ObjectId(to),
      fromModel,
      toModel,
      content,
      attachment: attachment || {}
    });

    return res.status(201).json({ message });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not send message' });
  }
});

export default router;
