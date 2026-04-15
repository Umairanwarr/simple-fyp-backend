import multer from 'multer';

const allowedPrescriptionMimes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
];

const prescriptionStorage = multer.memoryStorage();

const prescriptionFileFilter = (req, file, cb) => {
  if (!allowedPrescriptionMimes.includes(file.mimetype)) {
    cb(new Error('Only JPG, PNG, WEBP images and PDF files are allowed'));
    return;
  }
  cb(null, true);
};

const uploadPrescriptions = multer({
  storage: prescriptionStorage,
  fileFilter: prescriptionFileFilter,
  limits: { fileSize: 8 * 1024 * 1024 } // 8 MB per file
}).array('prescriptions', 5); // max 5 files

export const handlePrescriptionUpload = (req, res, next) => {
  uploadPrescriptions(req, res, (error) => {
    if (error) {
      return res.status(400).json({ message: error.message || 'Could not upload prescription files' });
    }
    return next();
  });
};
