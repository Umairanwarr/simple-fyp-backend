import crypto from 'crypto';

export const generateOtp = (length = 6) => {
  const digits = '0123456789';
  let otp = '';

  for (let i = 0; i < length; i += 1) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }

  return otp;
};

export const hashOtp = (otp) => {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
};

export const getOtpExpiryDate = (minutes = 10) => {
  return new Date(Date.now() + minutes * 60 * 1000);
};
