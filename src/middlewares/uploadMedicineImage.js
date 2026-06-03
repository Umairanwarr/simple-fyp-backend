import multer from 'multer';

const allowedImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

const medicineImageStorage = multer.memoryStorage();

const medicineImageFileFilter = (req, file, cb) => {
  if (!allowedImageMimeTypes.includes(file.mimetype)) {
    cb(new Error('Only JPG, JPEG, PNG, and WEBP images are allowed'));
    return;
  }

  cb(null, true);
};

const uploadMedicineImage = multer({
  storage: medicineImageStorage,
  fileFilter: medicineImageFileFilter,
  limits: {
    fileSize: 4 * 1024 * 1024 // 4MB
  }
}).single('image');

export const handleMedicineImageUpload = (req, res, next) => {
  uploadMedicineImage(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: error.message || 'Could not upload medicine image' });
    }

    return next();
  });
};
