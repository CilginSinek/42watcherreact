import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../_lib/mongodb';
import { getSessionModel } from '../_models/Session';
import { logEvent } from '../_lib/logger';
import { setCorsHeaders, handleOptions } from '../_lib/auth';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  const sessionToken = authHeader.split(' ')[1];

  try {
    await connectDB();
    const Session = getSessionModel();

    const session = await Session.findOne({ sessionToken });
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    if (new Date() > session.expiresAt) {
      await Session.deleteOne({ sessionToken });
      return res.status(401).json({ error: 'Session expired' });
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      (req.headers['x-real-ip'] as string) || 'unknown';

    if (!session.usedIps.includes(clientIp)) {
      session.usedIps.push(clientIp);
    }
    session.lastActivity = new Date();
    await session.save();

    logEvent(
      req,
      session.userData?.login || 'unknown',
      session.userData?.campus_users?.[0]?.campus_id || 0,
      'user_info_view',
      { userId: session.userData?.id }
    );

    return res.status(200).json(session.userData);
  } catch (error) {
    console.error('Error fetching user data:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
