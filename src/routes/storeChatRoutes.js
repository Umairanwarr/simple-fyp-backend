import mongoose from 'mongoose';
import express from 'express';
import StoreChatMessage from '../models/StoreChatMessage.js';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { MedicalStore } from '../models/MedicalStore.js';
import { Patient } from '../models/Patient.js';
import { sendNewChatMessageEmail } from '../services/mailService.js';

const router = express.Router();

const getStorePartnerInfo = async (id, modelName) => {
  try {
    if (!id) return { name: '', avatarUrl: '' };

    if (modelName === 'MedicalStore') {
      const store = await MedicalStore.findById(id).lean();
      if (!store) return { name: '', avatarUrl: '' };
      return {
        name: String(store.name || ''),
        avatarUrl: String(store.avatarDocument?.url || '')
      };
    }

    if (modelName === 'Patient') {
      const p = await Patient.findById(id).lean();
      if (!p) return { name: '', avatarUrl: '' };
      return {
        name: `${String(p.firstName || '')} ${String(p.lastName || '')}`.trim(),
        avatarUrl: String(p.avatarDocument?.url || '')
      };
    }

    return { name: '', avatarUrl: '' };
  } catch (err) {
    return { name: '', avatarUrl: '' };
  }
};

// Get partner info by ID
router.get('/partner/:partnerId', requireRoleAuth(), async (req, res) => {
  try {
    const partnerId = String(req.params.partnerId || '').trim();
    if (!partnerId) return res.status(400).json({ message: 'Missing partnerId' });

    const store = await MedicalStore.findById(partnerId).select('name avatarDocument').lean();
    if (store) {
      return res.json({
        partnerId,
        partnerName: String(store.name || '').trim(),
        partnerAvatar: String(store.avatarDocument?.url || '').trim()
      });
    }

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

// Get messages between two users
router.get('/messages/:otherUserId', requireRoleAuth(), async (req, res) => {
  try {
    const userId = String(req.user.id || '').trim();
    const otherId = String(req.params.otherUserId || '').trim();

    if (!userId || !otherId) return res.status(400).json({ message: 'Missing user id' });

    await StoreChatMessage.updateMany(
      { to: new mongoose.Types.ObjectId(userId), from: new mongoose.Types.ObjectId(otherId), readAt: null },
      { $set: { readAt: new Date() } }
    );

    const messages = await StoreChatMessage.find({
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

// Get conversations list
router.get('/conversations', requireRoleAuth(), async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(String(req.user.id || '').trim());

    const agg = await StoreChatMessage.aggregate([
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

      const partnerInfo = await getStorePartnerInfo(partnerId, partnerModel);

      const unreadCount = await StoreChatMessage.countDocuments({
        from: new mongoose.Types.ObjectId(partnerId),
        to: new mongoose.Types.ObjectId(userId),
        readAt: null
      });

      results.push({
        partnerId,
        partnerModel,
        partnerName: partnerInfo.name,
        partnerAvatar: partnerInfo.avatarUrl,
        lastMessage: last,
        unreadCount
      });
    }

    return res.json({ conversations: results });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch conversations' });
  }
});

// Search stores (for patients to start a new chat)
router.get('/search-stores', requireRoleAuth(), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ stores: [] });

    const stores = await MedicalStore.find({
      applicationStatus: 'approved',
      emailVerified: true,
      name: { $regex: q, $options: 'i' }
    })
      .select('name avatarDocument address')
      .limit(10)
      .lean();

    return res.json({
      stores: stores.map(s => ({
        id: String(s._id),
        name: String(s.name || ''),
        avatarUrl: String(s.avatarDocument?.url || ''),
        address: String(s.address || '')
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not search stores' });
  }
});

// Send message (REST fallback)
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

    const ROLE_TO_MODEL = {
      patient: 'Patient',
      'medical-store': 'MedicalStore'
    };

    const fromModel = ROLE_TO_MODEL[role] || 'Patient';

    // Stores can only reply — not initiate
    if (fromModel === 'MedicalStore') {
      const existingThread = await StoreChatMessage.findOne({
        $or: [
          { from: new mongoose.Types.ObjectId(to), to: new mongoose.Types.ObjectId(userId) },
          { from: new mongoose.Types.ObjectId(userId), to: new mongoose.Types.ObjectId(to) }
        ]
      });
      if (!existingThread) {
        return res.status(403).json({ message: 'Stores cannot initiate chats. Wait for a patient to message you first.' });
      }
    }

    const toModel = fromModel === 'MedicalStore' ? 'Patient' : 'MedicalStore';

    const message = await StoreChatMessage.create({
      from: new mongoose.Types.ObjectId(userId),
      to: new mongoose.Types.ObjectId(to),
      fromModel,
      toModel,
      content,
      attachment: attachment || {}
    });

    // Fire-and-forget email notification
    try {
      const SenderModel = fromModel === 'MedicalStore' ? MedicalStore : Patient;
      const RecipientModel = toModel === 'MedicalStore' ? MedicalStore : Patient;

      const [senderDoc, recipientDoc] = await Promise.all([
        SenderModel.findById(userId).select(fromModel === 'MedicalStore' ? 'name' : 'firstName lastName').lean(),
        RecipientModel.findById(to).select(toModel === 'MedicalStore' ? 'email name' : 'email firstName lastName').lean()
      ]);

      if (senderDoc && recipientDoc && recipientDoc.email) {
        const senderName = fromModel === 'MedicalStore' ? senderDoc.name : `${senderDoc.firstName} ${senderDoc.lastName}`;
        const recipientName = toModel === 'MedicalStore' ? recipientDoc.name : `${recipientDoc.firstName} ${recipientDoc.lastName}`;
        sendNewChatMessageEmail({
          to: recipientDoc.email,
          recipientName,
          senderName,
          senderRole: fromModel === 'MedicalStore' ? 'medical store' : 'patient',
          messagePreview: content.length > 50 ? content.substring(0, 47) + '...' : content
        }).catch(err => console.error('Store chat email error:', err));
      }
    } catch (emailErr) {
      console.error('Failed to send store chat email:', emailErr);
    }

    return res.status(201).json({ message });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not send message' });
  }
});

export default router;
