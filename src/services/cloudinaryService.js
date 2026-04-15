import { v2 as cloudinary } from 'cloudinary';

let isConfigured = false;

const ensureCloudinaryConfigured = () => {
  if (isConfigured) {
    return;
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials are missing in environment variables.');
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret
  });

  isConfigured = true;
};

export const uploadDoctorLicenseToCloudinary = async (file) => {
  return uploadDocumentToCloudinary(file, {
    folder: process.env.CLOUDINARY_DOCTOR_FOLDER || 'fyp/doctors/licenses',
    fallbackBaseName: 'license'
  });
};

export const uploadClinicPermitToCloudinary = async (file) => {
  return uploadDocumentToCloudinary(file, {
    folder: process.env.CLOUDINARY_CLINIC_FOLDER || 'fyp/clinics/permits',
    fallbackBaseName: 'permit'
  });
};

export const uploadMedicalStoreLicenseToCloudinary = async (file) => {
  return uploadDocumentToCloudinary(file, {
    folder: process.env.CLOUDINARY_MEDICAL_STORE_FOLDER || 'fyp/medical-stores/licenses',
    fallbackBaseName: 'license'
  });
};

export const uploadUserAvatarToCloudinary = async (file, role = 'users') => {
  const sanitizedRole = String(role || 'users').replace(/[^a-zA-Z0-9-_]/g, '') || 'users';

  return uploadDocumentToCloudinary(file, {
    folder: process.env.CLOUDINARY_AVATAR_FOLDER || `fyp/${sanitizedRole}/avatars`,
    fallbackBaseName: 'avatar'
  });
};

export const uploadDoctorMediaToCloudinary = async (file) => {
  return uploadDocumentToCloudinary(file, {
    folder: process.env.CLOUDINARY_DOCTOR_MEDIA_FOLDER || 'fyp/doctors/media',
    fallbackBaseName: 'doctor_media'
  });
};

export const uploadStoreMediaToCloudinary = async (file) => {
  return uploadDocumentToCloudinary(file, {
    folder: 'fyp/medical-stores/media',
    fallbackBaseName: 'store_media'
  });
};

export const uploadPrescriptionToCloudinary = async (file) => {
  return uploadDocumentToCloudinary(file, {
    folder: 'fyp/prescriptions',
    fallbackBaseName: 'prescription'
  });
};

const uploadDocumentToCloudinary = async (file, { folder, fallbackBaseName }) => {
  ensureCloudinaryConfigured();

  if (!file || !file.buffer) {
    throw new Error('No file provided for upload');
  }

  return new Promise((resolve, reject) => {
    const originalName = String(file.originalname || '').trim();
    const isPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(originalName);
    const isVideo = String(file.mimetype || '').toLowerCase().startsWith('video/');
    const resourceType = isPdf ? 'raw' : isVideo ? 'video' : 'image';

    const sanitizedBaseName = originalName
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 80) || fallbackBaseName;

    const uploadOptions = {
      folder,
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true
    };

    // For raw PDF uploads Cloudinary needs extension in public_id for correct asset delivery.
    if (isPdf) {
      uploadOptions.public_id = `${Date.now()}_${sanitizedBaseName}.pdf`;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
          format: result.format || (isPdf ? 'pdf' : null),
          originalName: originalName || null,
          bytes: result.bytes || null
        });
      }
    );

    uploadStream.end(file.buffer);
  });
};

export const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  ensureCloudinaryConfigured();

  if (!publicId) {
    return;
  }

  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};
