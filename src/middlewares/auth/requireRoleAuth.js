import jwt from 'jsonwebtoken';

export const requireRoleAuth = (allowedRoles = []) => {
  const normalizedAllowedRoles = Array.isArray(allowedRoles)
    ? allowedRoles.map((role) => String(role || '').trim()).filter(Boolean)
    : [];

  return (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Unauthorized: Missing token' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

      if (normalizedAllowedRoles.length > 0 && !normalizedAllowedRoles.includes(decoded.role)) {
        return res.status(403).json({ message: 'Forbidden: Access denied for this role' });
      }

      req.user = decoded;
      return next();
    } catch (error) {
      return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
  };
};
