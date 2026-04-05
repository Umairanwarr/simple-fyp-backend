import multer from 'multer';

const allowedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
];

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    cb(new Error('Only PDF, JPG, JPEG, PNG, and WEBP files are allowed'));
    return;
  }

  cb(null, true);
};

export const uploadClinicPermit = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 7 * 1024 * 1024
  }
}).single('permitMedia');

export const handleClinicPermitUpload = (req, res, next) => {
  uploadClinicPermit(req, res, (error) => {
    if (error) {
      return res.status(400).json({ message: error.message || 'Could not upload permit file' });
    }

    return next();
  });
};
