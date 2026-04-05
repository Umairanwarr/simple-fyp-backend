import jwt from 'jsonwebtoken';

export const generateAuthToken = (payload, expiresIn = '24h') => {
  return jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn
  });
};
