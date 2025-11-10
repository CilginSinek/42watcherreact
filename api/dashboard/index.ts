import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { Student, Project, LocationStats } from '../models/Student.js';

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

  // Authorization kontrolü
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

  try {
    await connectDB();

    // Tarih hesaplamaları
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    // Son 3 ay için tarih aralığı
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const threeMonthsAgoStr = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

    // Bu ay en çok proje teslim edenler (score > 0 olanlar)
    const topProjectSubmitters = await Project.aggregate([
      {
        $match: {
          date: {
            $gte: monthStart.toISOString().split('T')[0],
            $lte: monthEnd.toISOString().split('T')[0]
          },
          score: { $gt: 0 } // Sadece başarılı projeler
        }
      },
      {
        $group: {
          _id: '$login',
          projectCount: { $sum: 1 },
          totalScore: { $sum: '$score' },
          projects: {
            $push: {
              project: '$project',
              score: '$score',
              date: '$date'
            }
          }
        }
      },
      {
        $sort: { projectCount: -1, totalScore: -1 }
      },
      {
        $limit: 5
      }
    ]);

    // Top submitters için student bilgilerini al
    const topSubmittersLogins = topProjectSubmitters.map((s: { _id: string }) => s._id);
    const topSubmittersStudents = await Student.find({ login: { $in: topSubmittersLogins } })
      .select('login displayname image correction_point wallet grade')
      .lean();

    // Student bilgilerini merge et
    const topSubmitters = topProjectSubmitters.map((proj: Record<string, unknown>) => {
      const student = topSubmittersStudents.find((s: Record<string, unknown>) => s.login === proj._id);
      return {
        login: proj._id,
        projectCount: proj.projectCount,
        totalScore: proj.totalScore,
        projects: proj.projects,
        student: student || null
      };
    });

    // Son 3 ay en çok kampüste kalanlar (location stats)
    const topLocationStats = await LocationStats.aggregate([
      {
        $project: {
          login: 1,
          campusId: 1,
          months: { $objectToArray: '$months' }
        }
      },
      {
        $unwind: '$months'
      },
      {
        $match: {
          'months.k': { $gte: threeMonthsAgoStr }
        }
      },
      {
        $group: {
          _id: '$login',
          totalDuration: { $sum: '$months.v.totalDuration' }
        }
      },
      {
        $match: {
          totalDuration: { $exists: true, $ne: null, $gt: 0 }
        }
      },
      {
        $sort: { totalDuration: -1 }
      },
      {
        $limit: 5
      }
    ]);

    // Top location stats için student bilgilerini al
    const topLocationLogins = topLocationStats.map((s: { _id: string }) => s._id);
    const topLocationStudents = await Student.find({ login: { $in: topLocationLogins } })
      .select('login displayname image correction_point wallet grade')
      .lean();

    // Student bilgilerini merge et
    const topLocations = topLocationStats.map((loc: Record<string, unknown>) => {
      const student = topLocationStudents.find((s: Record<string, unknown>) => s.login === loc._id);
      return {
        login: loc._id,
        totalDuration: loc.totalDuration,
        student: student || null
      };
    });

    // TÜM ZAMANLAR İSTATİSTİKLERİ

    // Tüm zamanlar en çok proje teslim edenler
    const allTimeProjects = await Project.aggregate([
      {
        $match: {
          score: { $gt: 0 } // Sadece başarılı projeler
        }
      },
      {
        $group: {
          _id: '$login',
          projectCount: { $sum: 1 },
          totalScore: { $sum: '$score' }
        }
      },
      {
        $sort: { projectCount: -1, totalScore: -1 }
      },
      {
        $limit: 5
      }
    ]);

    // Tüm zamanlar en çok proje teslim edenler için student bilgileri
    const allTimeProjectsLogins = allTimeProjects.map((s: { _id: string }) => s._id);
    const allTimeProjectsStudents = await Student.find({ login: { $in: allTimeProjectsLogins } })
      .select('login displayname image correction_point wallet grade')
      .lean();

    const allTimeProjectsWithStudents = allTimeProjects.map((proj: Record<string, unknown>) => {
      const student = allTimeProjectsStudents.find((s: Record<string, unknown>) => s.login === proj._id);
      return {
        login: proj._id,
        projectCount: proj.projectCount,
        totalScore: proj.totalScore,
        student: student || null
      };
    });

    // Tüm zamanlar en yüksek wallet
    const allTimeWallet = await Student.find({ wallet: { $exists: true, $ne: null } })
      .select('login displayname image correction_point wallet grade')
      .sort({ wallet: -1 })
      .limit(5)
      .lean();

    const allTimeWalletFormatted = allTimeWallet.map((student: Record<string, unknown>) => ({
      login: student.login,
      wallet: student.wallet,
      student: student
    }));

    // Tüm zamanlar en yüksek evaluation points
    const allTimePoints = await Student.find({ correction_point: { $exists: true, $ne: null } })
      .select('login displayname image correction_point wallet grade')
      .sort({ correction_point: -1 })
      .limit(5)
      .lean();

    const allTimePointsFormatted = allTimePoints.map((student: Record<string, unknown>) => ({
      login: student.login,
      correctionPoint: student.correction_point,
      student: student
    }));

    return res.status(200).json({
      currentMonth,
      topProjectSubmitters: topSubmitters,
      topLocationStats: topLocations,
      allTimeProjects: allTimeProjectsWithStudents,
      allTimeWallet: allTimeWalletFormatted,
      allTimePoints: allTimePointsFormatted
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
