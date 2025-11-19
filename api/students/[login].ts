import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { Student, Project, LocationStats, Feedback } from '../models/Student.js';

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define MONGODB_URI environment variable');
}

interface CachedConnection {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: CachedConnection | undefined;
}

const cached: CachedConnection = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI!, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if running on localhost (skip auth for local development)
  const isLocalhost = req.headers.host?.includes('localhost') || req.headers.host?.includes('127.0.0.1');

  // Authorization kontrolü (skip for localhost)
  if (!isLocalhost) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];

    // Token'ı 42 API ile doğrula
    try {
      const verifyResponse = await fetch('https://api.intra.42.fr/v2/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!verifyResponse.ok) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({ error: 'Token verification failed' });
    }
  }

  try {
    await connectDB();

    const { login } = req.query;

    if (!login || typeof login !== 'string') {
      return res.status(400).json({ error: 'Login parameter is required' });
    }

    // Student bilgisini getir
    const student = await Student.findOne({ login }).lean();

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Student'a ait projeleri getir
    const projects = await Project.find({ login })
      .select('project score date status')
      .sort({ date: -1 })
      .limit(20)
      .lean();

    // Location stats
    const locationStats = await LocationStats.find({ login })
      .select('month duration location')
      .sort({ month: -1 })
      .limit(12)
      .lean();

    // Feedback bilgisi
    const feedbacks = await Feedback.find({ login })
      .select('rating comment date')
      .sort({ date: -1 })
      .limit(10)
      .lean();

    const feedbackCount = await Feedback.countDocuments({ login });
    const avgRatingResult = await Feedback.aggregate([
      { $match: { login } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' }
        }
      }
    ]);

    const avgRating = avgRatingResult.length > 0 ? avgRatingResult[0].avgRating : 0;

    // Log times için aggregation (son 30 gün)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const logTimes = await LocationStats.aggregate([
      {
        $match: {
          login,
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $project: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          duration: 1
        }
      },
      {
        $group: {
          _id: '$date',
          totalDuration: { $sum: { $toDouble: '$duration' } }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          date: '$_id',
          duration: '$totalDuration',
          _id: 0
        }
      }
    ]);

    // Attendance days (haftalık ortalama)
    const attendanceDays = await LocationStats.aggregate([
      {
        $match: { login }
      },
      {
        $project: {
          dayOfWeek: { $dayOfWeek: '$createdAt' },
          duration: 1
        }
      },
      {
        $group: {
          _id: '$dayOfWeek',
          avgHours: { $avg: { $toDouble: '$duration' } }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          day: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id', 1] }, then: 'Sun' },
                { case: { $eq: ['$_id', 2] }, then: 'Mon' },
                { case: { $eq: ['$_id', 3] }, then: 'Tue' },
                { case: { $eq: ['$_id', 4] }, then: 'Wed' },
                { case: { $eq: ['$_id', 5] }, then: 'Thu' },
                { case: { $eq: ['$_id', 6] }, then: 'Fri' },
                { case: { $eq: ['$_id', 7] }, then: 'Sat' }
              ],
              default: 'Unknown'
            }
          },
          avgHours: 1,
          _id: 0
        }
      }
    ]);

    return res.status(200).json({
      student: {
        ...student,
        projects,
        feedbackCount,
        avgRating,
        logTimes,
        attendanceDays
      }
    });

  } catch (error) {
    console.error('Error fetching student details:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
