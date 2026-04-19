import express from 'express';
import { requireRoleAuth } from '../middlewares/auth/requireRoleAuth.js';
import { LiveStream } from '../models/LiveStream.js';
import { Doctor } from '../models/Doctor.js';
import pkg from 'agora-access-token';
const { RtcTokenBuilder, RtcRole } = pkg;

const router = express.Router();

const generateStreamChannel = () => `livestream_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

const buildAgoraToken = (channelName, role) => {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !appCertificate) throw new Error('Agora credentials not configured');

  const uid = 0;
  const expirationTimeInSeconds = 7200;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  return RtcTokenBuilder.buildTokenWithUid(appId, appCertificate, channelName, uid, role, privilegeExpiredTs);
};

// ─── Create / Schedule a Live Stream ───
router.post('/create', requireRoleAuth(['doctor']), async (req, res) => {
  try {
    const doctorId = req.user.id;
    const doctor = await Doctor.findById(doctorId).select('fullName currentPlan avatar').lean();

    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const plan = String(doctor.currentPlan || '').toLowerCase();
    if (plan !== 'diamond') {
      return res.status(403).json({ message: 'Live streaming is only available for Diamond plan subscribers' });
    }

    const { title, description, scheduledAt, startNow } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: 'Stream title is required' });
    }

    const channelName = generateStreamChannel();
    const streamData = {
      doctorId,
      doctorName: doctor.fullName,
      doctorAvatar: doctor.avatar?.url || '',
      title: String(title).trim(),
      description: String(description || '').trim(),
      channelName,
      status: startNow ? 'live' : 'scheduled',
      scheduledAt: startNow ? null : (scheduledAt ? new Date(scheduledAt) : null),
      startedAt: startNow ? new Date() : null
    };

    const stream = await LiveStream.create(streamData);

    let token = null;
    if (startNow) {
      token = buildAgoraToken(channelName, RtcRole.PUBLISHER);
    }

    return res.status(201).json({ stream, token });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not create stream' });
  }
});

// ─── Start a Scheduled Stream ───
router.patch('/:streamId/start', requireRoleAuth(['doctor']), async (req, res) => {
  try {
    const stream = await LiveStream.findOne({ _id: req.params.streamId, doctorId: req.user.id });
    if (!stream) return res.status(404).json({ message: 'Stream not found' });
    if (stream.status === 'live') return res.status(400).json({ message: 'Stream is already live' });
    if (stream.status === 'ended') return res.status(400).json({ message: 'Stream has already ended' });

    stream.status = 'live';
    stream.startedAt = new Date();
    await stream.save();

    const token = buildAgoraToken(stream.channelName, RtcRole.PUBLISHER);
    return res.json({ stream, token });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not start stream' });
  }
});

// ─── End a Live Stream ───
router.patch('/:streamId/end', requireRoleAuth(['doctor']), async (req, res) => {
  try {
    const stream = await LiveStream.findOne({ _id: req.params.streamId, doctorId: req.user.id });
    if (!stream) return res.status(404).json({ message: 'Stream not found' });

    stream.status = 'ended';
    stream.endedAt = new Date();
    await stream.save();

    return res.json({ stream });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not end stream' });
  }
});

// ─── Delete a Stream ───
router.delete('/:streamId', requireRoleAuth(['doctor']), async (req, res) => {
  try {
    const stream = await LiveStream.findOneAndDelete({ _id: req.params.streamId, doctorId: req.user.id });
    if (!stream) return res.status(404).json({ message: 'Stream not found' });
    return res.json({ message: 'Stream deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not delete stream' });
  }
});

// ─── Admin Terminate Stream ───
router.patch('/:streamId/admin-terminate', requireRoleAuth(['admin']), async (req, res) => {
  try {
    const stream = await LiveStream.findById(req.params.streamId);
    if (!stream) return res.status(404).json({ message: 'Stream not found' });

    stream.status = 'ended';
    stream.endedAt = new Date();
    stream.adminTerminationReason = req.body.reason || 'Terminated by Admin';
    await stream.save();

    // Create notification for the doctor
    try {
      const { DoctorLivestreamNotification } = await import('../models/DoctorLivestreamNotification.js');
      await DoctorLivestreamNotification.create({
        doctorId: stream.doctorId,
        streamId: stream._id,
        streamTitle: stream.title,
        reason: stream.adminTerminationReason
      });
    } catch (notifError) {
      console.error('Failed to create admin termination notification:', notifError);
    }

    return res.json({ stream });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not terminate stream' });
  }
});

// ─── Get Doctor's Streams ───
router.get('/my-streams', requireRoleAuth(['doctor']), async (req, res) => {
  try {
    const streams = await LiveStream.find({ doctorId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ streams });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch streams' });
  }
});

// ─── Get All Active / Upcoming Streams (public for patients) ───
router.get('/active', requireRoleAuth(), async (req, res) => {
  try {
    const streams = await LiveStream.find({
      status: { $in: ['live', 'scheduled'] }
    })
      .sort({ status: 1, scheduledAt: 1, createdAt: -1 })
      .lean();
    return res.json({ streams });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch active streams' });
  }
});

// ─── Join a Stream as Viewer (get audience token) ───
router.get('/:streamId/join', requireRoleAuth(), async (req, res) => {
  try {
    const stream = await LiveStream.findById(req.params.streamId);
    if (!stream) return res.status(404).json({ message: 'Stream not found' });
    if (stream.status !== 'live') return res.status(400).json({ message: 'Stream is not currently live' });

    const token = buildAgoraToken(stream.channelName, RtcRole.SUBSCRIBER);
    return res.json({ stream, token, channelName: stream.channelName });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not join stream' });
  }
});

// ─── Join as Guest Co-Host (get publisher token) ───
router.get('/:streamId/join-as-guest', requireRoleAuth(), async (req, res) => {
  try {
    const stream = await LiveStream.findById(req.params.streamId);
    if (!stream) return res.status(404).json({ message: 'Stream not found' });
    if (stream.status !== 'live') return res.status(400).json({ message: 'Stream is not currently live' });

    const token = buildAgoraToken(stream.channelName, RtcRole.PUBLISHER);
    return res.json({ stream, token, channelName: stream.channelName });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not join as guest' });
  }
});

// ─── Invite Guest to Stream ───
router.post('/:streamId/invite', requireRoleAuth(['doctor']), async (req, res) => {
  try {
    const stream = await LiveStream.findOne({ _id: req.params.streamId, doctorId: req.user.id });
    if (!stream) return res.status(404).json({ message: 'Stream not found' });

    const { guestId, guestModel, guestName } = req.body;
    if (!guestId) return res.status(400).json({ message: 'Guest ID is required' });

    const alreadyInvited = stream.invitedGuests.find(g => String(g.odIf) === String(guestId));
    if (alreadyInvited) return res.status(400).json({ message: 'Guest already invited' });

    stream.invitedGuests.push({
      odIf: guestId,
      odModel: guestModel || 'Doctor',
      name: guestName || '',
      status: 'pending'
    });
    await stream.save();

    return res.json({ stream });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not invite guest' });
  }
});

// ─── Get Token for Host (publisher) ───
router.get('/:streamId/host-token', requireRoleAuth(['doctor']), async (req, res) => {
  try {
    const stream = await LiveStream.findOne({ _id: req.params.streamId, doctorId: req.user.id });
    if (!stream) return res.status(404).json({ message: 'Stream not found' });

    const token = buildAgoraToken(stream.channelName, RtcRole.PUBLISHER);
    return res.json({ token, channelName: stream.channelName });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not get token' });
  }
});

export default router;
