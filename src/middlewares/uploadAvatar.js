import multer from 'multer';

const allowedImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

const avatarStorage = multer.memoryStorage();

const avatarFileFilter = (req, file, cb) => {
  if (!allowedImageMimeTypes.includes(file.mimetype)) {
    cb(new Error('Only JPG, JPEG, PNG, and WEBP images are allowed'));
    return;
  }

  cb(null, true);
};

const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: avatarFileFilter,
  limits: {
    fileSize: 4 * 1024 * 1024
  }
}).single('avatar');

export const handleAvatarUpload = (req, res, next) => {
  uploadAvatar(req, res, (error) => {
    if (error) {
      return res.status(400).json({ message: error.message || 'Could not upload avatar image' });
    }

    return next();
  });
};
