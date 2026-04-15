import multer from 'multer';

const allowedImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
const allowedVideoMimeTypes = ['video/mp4', 'video/webm', 'video/quicktime'];

const mediaStorage = multer.memoryStorage();

const mediaFileFilter = (req, file, cb) => {
  const mimeType = String(file?.mimetype || '').trim().toLowerCase();

  if (!allowedImageMimeTypes.includes(mimeType) && !allowedVideoMimeTypes.includes(mimeType)) {
    cb(new Error('Only JPG, JPEG, PNG, WEBP images and MP4, WEBM, MOV videos are allowed'));
    return;
  }

  cb(null, true);
};

const uploadDoctorMedia = multer({
  storage: mediaStorage,
  fileFilter: mediaFileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024
  }
}).single('media');

export const handleDoctorMediaUpload = (req, res, next) => {
  uploadDoctorMedia(req, res, (error) => {
    if (error) {
      return res.status(400).json({ message: error.message || 'Could not upload media file' });
    }

    return next();
  });
};
