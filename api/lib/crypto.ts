import crypto from 'crypto';

const SECRET_KEY = process.env.SESSION_SECRET || 'your-secret-key-change-this-min-32-chars';

// Generate a 32-byte key from the secret
function getKey(): Buffer {
  return crypto.createHash('sha256').update(SECRET_KEY).digest();
}

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decryptToken(encryptedToken: string): string {
  const parts = encryptedToken.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
