import crypto from 'crypto';

const ENCRYPTION_PREFIX = 'enc:v1:';
const ENCRYPTION_ALGO = 'aes-256-gcm';
const IV_BYTE_LENGTH = 12;

let cachedKey = null;

const normalizeKeyFromEnvironment = () => {
  const rawKey = String(process.env.CHAT_ENCRYPTION_KEY || process.env.MESSAGE_ENCRYPTION_KEY || '').trim();
  if (!rawKey) return null;

  if (/^[a-fA-F0-9]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }

  try {
    const asBase64 = Buffer.from(rawKey, 'base64');
    if (asBase64.length === 32) {
      return asBase64;
    }
  } catch {
    // ignore
  }

  return crypto.createHash('sha256').update(rawKey).digest();
};

const getEncryptionKey = () => {
  if (cachedKey) return cachedKey;
  const envKey = normalizeKeyFromEnvironment();
  if (envKey) {
    cachedKey = envKey;
    return cachedKey;
  }

  const fallbackMaterial = String(process.env.JWT_SECRET || 'chat-fallback-secret');
  cachedKey = crypto.createHash('sha256').update(fallbackMaterial).digest();
  return cachedKey;
};

const toBase64 = (valueBuffer) => Buffer.from(valueBuffer).toString('base64');
const fromBase64 = (value) => Buffer.from(String(value || ''), 'base64');

export const encryptChatText = (plainText) => {
  const text = String(plainText || '');
  if (!text) return '';

  const iv = crypto.randomBytes(IV_BYTE_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${toBase64(iv)}.${toBase64(authTag)}.${toBase64(encrypted)}`;
};

export const decryptChatText = (storedValue) => {
  const value = String(storedValue || '');
  if (!value) return '';

  if (!value.startsWith(ENCRYPTION_PREFIX)) {
    return value;
  }

  const payload = value.slice(ENCRYPTION_PREFIX.length);
  const [ivEncoded, tagEncoded, encryptedEncoded] = payload.split('.');

  if (!ivEncoded || !tagEncoded || !encryptedEncoded) {
    return '';
  }

  try {
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, getEncryptionKey(), fromBase64(ivEncoded));
    decipher.setAuthTag(fromBase64(tagEncoded));
    const decrypted = Buffer.concat([decipher.update(fromBase64(encryptedEncoded)), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
};

export const encryptChatPayload = ({ content = '', attachment = null } = {}) => {
  const normalizedAttachment = attachment && typeof attachment === 'object' ? attachment : {};
  const attachmentUrl = String(normalizedAttachment.url || '');

  return {
    content: encryptChatText(content),
    attachment: attachment
      ? {
          ...normalizedAttachment,
          url: attachmentUrl ? encryptChatText(attachmentUrl) : ''
        }
      : {}
  };
};

export const decryptChatMessageRecord = (messageRecord) => {
  if (!messageRecord || typeof messageRecord !== 'object') return messageRecord;

  const baseMessage = messageRecord.toObject ? messageRecord.toObject() : { ...messageRecord };
  const attachment = baseMessage.attachment && typeof baseMessage.attachment === 'object'
    ? { ...baseMessage.attachment }
    : {};

  return {
    ...baseMessage,
    content: decryptChatText(baseMessage.content),
    attachment: {
      ...attachment,
      url: decryptChatText(attachment.url)
    }
  };
};
