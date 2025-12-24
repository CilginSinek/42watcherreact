import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';

// ============ MONGODB CONNECTION ============
const MONGODB_URL2 = process.env.MONGODB_URL2 || '';
interface CachedDB2 { conn: mongoose.Connection | null; }
const cachedDB2: CachedDB2 = { conn: null };

async function connectDB2(): Promise<mongoose.Connection> {
  if (cachedDB2.conn && cachedDB2.conn.readyState === 1) return cachedDB2.conn;
  cachedDB2.conn = mongoose.createConnection(MONGODB_URL2);
  await new Promise<void>((resolve, reject) => {
    cachedDB2.conn!.once('connected', resolve);
    cachedDB2.conn!.once('error', reject);
  });
  return cachedDB2.conn;
}

// ============ SESSION MODEL ============
const sessionSchema = new mongoose.Schema({
  sessionToken: { type: String, required: true, unique: true, index: true },
  login: { type: String, required: true, index: true },
  campusId: { type: Number, required: true },
  userData: { type: mongoose.Schema.Types.Mixed },
  usedIps: [{ type: String }],
  lastActivity: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: true }
}, { timestamps: true });

function getSessionModel() {
  const db2 = cachedDB2.conn!;
  return db2.models.Session || db2.model('Session', sessionSchema);
}

// ============ CORS HELPERS ============
function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Content-Type', 'application/json');
}

// ============ HANDLER ============
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authorization token required' });

  const sessionToken = authHeader.split(' ')[1];

  try {
    await connectDB2();
    const Session = getSessionModel();

    const session = await Session.findOne({ sessionToken });
    if (!session) return res.status(401).json({ error: 'Invalid or expired session' });
    if (new Date() > session.expiresAt) {
      await Session.deleteOne({ sessionToken });
      return res.status(401).json({ error: 'Session expired' });
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || (req.headers['x-real-ip'] as string) || 'unknown';
    if (!session.usedIps.includes(clientIp)) session.usedIps.push(clientIp);
    session.lastActivity = new Date();
    await session.save();

    return res.status(200).json(session.userData);
  } catch (error) {
    console.error('Error fetching user data:', error);
    return res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}
