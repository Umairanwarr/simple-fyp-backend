import mongoose from 'mongoose';
import express from 'express';
import ClinicChatMessage from '../models/ClinicChatMessage.js';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { Clinic } from '../models/Clinic.js';
import { Patient } from '../models/Patient.js';
import { sendNewChatMessageEmail } from '../services/mailService.js';
import { decryptChatMessageRecord, encryptChatPayload } from '../utils/chatCrypto.js';

const router = express.Router();

const getClinicPartnerInfo = async (id, modelName) => {
  try {
    if (!id) return { name: '', avatarUrl: '' };

    if (modelName === 'Clinic') {
      const clinic = await Clinic.findById(id).lean();
      if (!clinic) return { name: '', avatarUrl: '' };
      return {
        name: String(clinic.name || ''),
        avatarUrl: String(clinic.avatarDocument?.url || '')
      };
    }

    if (modelName === 'Patient') {
      const patient = await Patient.findById(id).lean();
      if (!patient) return { name: '', avatarUrl: '' };
      return {
        name: `${String(patient.firstName || '')} ${String(patient.lastName || '')}`.trim(),
        avatarUrl: String(patient.avatarDocument?.url || '')
      };
    }

    return { name: '', avatarUrl: '' };
  } catch (err) {
    return { name: '', avatarUrl: '' };
  }
};

router.get('/partner/:partnerId', requireRoleAuth(), async (req, res) => {
  try {
    const partnerId = String(req.params.partnerId || '').trim();
    if (!partnerId) return res.status(400).json({ message: 'Missing partnerId' });

    const clinic = await Clinic.findById(partnerId).select('name avatarDocument').lean();
    if (clinic) {
      return res.json({
        partnerId,
        partnerName: String(clinic.name || '').trim(),
        partnerAvatar: String(clinic.avatarDocument?.url || '').trim()
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

router.get('/messages/:otherUserId', requireRoleAuth(), async (req, res) => {
  try {
    const userId = String(req.user.id || '').trim();
    const otherId = String(req.params.otherUserId || '').trim();

    if (!userId || !otherId) return res.status(400).json({ message: 'Missing user id' });

    await ClinicChatMessage.updateMany(
      { to: new mongoose.Types.ObjectId(userId), from: new mongoose.Types.ObjectId(otherId), readAt: null },
      { $set: { readAt: new Date() } }
    );

    const messages = await ClinicChatMessage.find({
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

router.get('/conversations', requireRoleAuth(), async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(String(req.user.id || '').trim());

    const agg = await ClinicChatMessage.aggregate([
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
      const partnerInfo = await getClinicPartnerInfo(partnerId, partnerModel);

      const unreadCount = await ClinicChatMessage.countDocuments({
        from: new mongoose.Types.ObjectId(partnerId),
        to: new mongoose.Types.ObjectId(userId),
        readAt: null
      });

      results.push({
        partnerId,
        partnerModel,
        partnerName: partnerInfo.name,
        partnerAvatar: partnerInfo.avatarUrl,
        lastMessage: decryptChatMessageRecord(last),
        unreadCount
      });
    }

    return res.json({ conversations: results });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch conversations' });
  }
});

router.get('/search-clinics', requireRoleAuth(), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ clinics: [] });

    const clinics = await Clinic.find({
      applicationStatus: 'approved',
      emailVerified: true,
      name: { $regex: q, $options: 'i' }
    })
      .select('name avatarDocument address')
      .limit(10)
      .lean();

    return res.json({
      clinics: clinics.map((clinic) => ({
        id: String(clinic._id),
        name: String(clinic.name || ''),
        avatarUrl: String(clinic.avatarDocument?.url || ''),
        address: String(clinic.address || '')
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not search clinics' });
  }
});

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
      clinic: 'Clinic'
    };

    const fromModel = ROLE_TO_MODEL[role] || 'Patient';

    if (fromModel === 'Clinic') {
      const existingThread = await ClinicChatMessage.findOne({
        $or: [
          { from: new mongoose.Types.ObjectId(to), to: new mongoose.Types.ObjectId(userId) },
          { from: new mongoose.Types.ObjectId(userId), to: new mongoose.Types.ObjectId(to) }
        ]
      });
      if (!existingThread) {
        return res.status(403).json({ message: 'Clinics cannot initiate chats. Wait for a patient to message you first.' });
      }
    }

    const toModel = fromModel === 'Clinic' ? 'Patient' : 'Clinic';

    const encryptedPayload = encryptChatPayload({ content, attachment: attachment || {} });

    const message = await ClinicChatMessage.create({
      from: new mongoose.Types.ObjectId(userId),
      to: new mongoose.Types.ObjectId(to),
      fromModel,
      toModel,
      content: encryptedPayload.content,
      attachment: encryptedPayload.attachment
    });

    try {
      const SenderModel = fromModel === 'Clinic' ? Clinic : Patient;
      const RecipientModel = toModel === 'Clinic' ? Clinic : Patient;

      const [senderDoc, recipientDoc] = await Promise.all([
        SenderModel.findById(userId).select(fromModel === 'Clinic' ? 'name' : 'firstName lastName').lean(),
        RecipientModel.findById(to).select(toModel === 'Clinic' ? 'email name' : 'email firstName lastName').lean()
      ]);

      if (senderDoc && recipientDoc && recipientDoc.email) {
        const senderName = fromModel === 'Clinic' ? senderDoc.name : `${senderDoc.firstName} ${senderDoc.lastName}`;
        const recipientName = toModel === 'Clinic' ? recipientDoc.name : `${recipientDoc.firstName} ${recipientDoc.lastName}`;
        sendNewChatMessageEmail({
          to: recipientDoc.email,
          recipientName,
          senderName,
          senderRole: fromModel === 'Clinic' ? 'clinic' : 'patient',
          messagePreview: content.length > 50 ? content.substring(0, 47) + '...' : content
        }).catch((err) => console.error('Clinic chat email error:', err));
      }
    } catch (emailErr) {
      console.error('Failed to send clinic chat email:', emailErr);
    }

    return res.status(201).json({ message: decryptChatMessageRecord(message) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not send message' });
  }
});

export default router;
