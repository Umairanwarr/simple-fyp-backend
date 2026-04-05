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

export const uploadDoctorLicense = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 7 * 1024 * 1024
  }
}).single('licenseMedia');

export const handleDoctorLicenseUpload = (req, res, next) => {
  uploadDoctorLicense(req, res, (error) => {
    if (error) {
      return res.status(400).json({ message: error.message || 'Could not upload license file' });
    }

    return next();
  });
};
