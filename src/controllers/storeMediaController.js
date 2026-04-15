import mongoose from 'mongoose';
import { DoctorMedia } from '../models/DoctorMedia.js';
import { MedicalStore } from '../models/MedicalStore.js';
import { deleteFromCloudinary, uploadStoreMediaToCloudinary } from '../services/cloudinaryService.js';

const getMediaTypeFromMime = (mimeTypeValue) => {
  const mimeType = String(mimeTypeValue || '').trim().toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return '';
};

const mapStoreMediaRecord = (record) => ({
  id:               String(record?._id || ''),
  mediaType:        String(record?.mediaType || '') === 'video' ? 'video' : 'image',
  url:              String(record?.asset?.url || ''),
  originalName:     String(record?.asset?.originalName || '') || 'media-file',
  format:           record?.asset?.format || null,
  bytes:            record?.asset?.bytes || 0,
  moderationStatus: String(record?.moderationStatus || 'pending'),
  moderationNote:   String(record?.moderationNote || ''),
  reviewedAt:       record?.reviewedAt || null,
  uploadedAt:       record?.createdAt || null,
  uploaderRole:     'medical-store'
});

// ─── GET library ───
export const getStoreMediaLibrary = async (req, res) => {
  try {
    const store = await MedicalStore.findById(req.user?.id)
      .select('name email')
      .lean();

    if (!store) return res.status(404).json({ message: 'Store not found' });

    const mediaRecords = await DoctorMedia.find({
      storeId: store._id,
      uploaderRole: 'medical-store',
      deletedAt: null
    })
      .sort({ createdAt: -1 })
      .lean();

    const imageCount = mediaRecords.filter(m => m.mediaType === 'image' && ['pending', 'approved'].includes(m.moderationStatus)).length;
    const videoCount = mediaRecords.filter(m => m.mediaType === 'video' && ['pending', 'approved'].includes(m.moderationStatus)).length;

    return res.status(200).json({
      media: mediaRecords.map(mapStoreMediaRecord),
      usage: { imageCount, videoCount }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Could not fetch store media', error: err.message });
  }
};

// ─── POST upload ───
export const uploadStoreMedia = async (req, res) => {
  let uploadedAsset = null;
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please select an image or video file to upload' });
    }

    const store = await MedicalStore.findById(req.user?.id)
      .select('name email')
      .lean();

    if (!store) return res.status(404).json({ message: 'Store not found' });

    const mediaType = getMediaTypeFromMime(req.file?.mimetype);
    if (!mediaType) return res.status(400).json({ message: 'Unsupported file type. Please upload an image or video.' });

    uploadedAsset = await uploadStoreMediaToCloudinary(req.file);

    const created = await DoctorMedia.create({
      // Leave doctorId/doctorName/doctorEmail as default empty values
      storeId:      store._id,
      storeName:    String(store.name || '').trim(),
      storeEmail:   String(store.email || '').trim().toLowerCase(),
      uploaderRole: 'medical-store',
      mediaType,
      asset:        uploadedAsset,
      moderationStatus: 'pending'
    });

    return res.status(201).json({
      message: 'Media uploaded successfully and sent for admin review',
      media: mapStoreMediaRecord(created)
    });
  } catch (err) {
    if (uploadedAsset?.publicId) {
      await deleteFromCloudinary(uploadedAsset.publicId, uploadedAsset.resourceType || 'image').catch(() => {});
    }
    return res.status(500).json({ message: 'Could not upload media', error: err.message });
  }
};

// ─── DELETE ───
export const deleteStoreMedia = async (req, res) => {
  try {
    const mediaId = String(req.params?.mediaId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(mediaId)) {
      return res.status(400).json({ message: 'Invalid media id' });
    }

    const record = await DoctorMedia.findOne({
      _id: mediaId,
      storeId: req.user?.id,
      uploaderRole: 'medical-store',
      deletedAt: null
    });

    if (!record) return res.status(404).json({ message: 'Media not found' });

    if (record?.asset?.publicId) {
      await deleteFromCloudinary(record.asset.publicId, record.asset.resourceType || 'image').catch(() => {});
    }

    record.deletedAt = new Date();
    await record.save();

    return res.status(200).json({ message: 'Media deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Could not delete media', error: err.message });
  }
};
