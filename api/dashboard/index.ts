import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { Student, Project, LocationStats, Patronage } from '../models/Student.js';

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

    // Query parametrelerini al
    const campusIdParam = req.query.campusId as string | undefined;
    
    // Campus filter oluştur
    const campusFilter = campusIdParam && campusIdParam !== 'all' 
      ? { campusId: parseInt(campusIdParam) } 
      : {};

    // Tarih hesaplamaları
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    // Son 3 ay için tarih aralığı
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const threeMonthsAgoStr = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

    // TÜM AGGREGATİONLARI PARALEL ÇALIŞTIR
    const [
      topProjectSubmitters,
      topLocationStats,
      allTimeProjects,
      allTimeWallet,
      allTimePoints,
      allTimeLevels
    ] = await Promise.all([
      // Bu ay en çok proje teslim edenler
      Project.aggregate([
        {
          $match: {
            ...campusFilter,
            date: {
              $gte: monthStart.toISOString().split('T')[0],
              $lte: monthEnd.toISOString().split('T')[0]
            },
            score: { $gt: 0 }
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
      ]),
      
      // Son 3 ay en çok kampüste kalanlar
      LocationStats.aggregate([
      {
        $match: campusFilter
      },
      {
        $project: {
          login: 1,
          campusId: 1,
          monthsArray: { $objectToArray: '$months' }
        }
      },
      {
        $unwind: '$monthsArray'
      },
      {
        $match: {
          'monthsArray.k': { $gte: threeMonthsAgoStr }
        }
      },
      {
        $addFields: {
          // totalDuration'ı string'den saniyeye çevir (HH:MM:SS formatı)
          durationParts: { $split: ['$monthsArray.v.totalDuration', ':'] },
        }
      },
      {
        $addFields: {
          durationSeconds: {
            $add: [
              { $multiply: [{ $toInt: { $arrayElemAt: ['$durationParts', 0] } }, 3600] }, // hours
              { $multiply: [{ $toInt: { $arrayElemAt: ['$durationParts', 1] } }, 60] },   // minutes
              { $toInt: { $arrayElemAt: ['$durationParts', 2] } }                         // seconds
            ]
          }
        }
      },
      {
        $group: {
          _id: '$login',
          totalDurationSeconds: { $sum: '$durationSeconds' }
        }
      },
      {
        $match: {
          totalDurationSeconds: { $exists: true, $ne: null, $gt: 0 }
        }
      },
      {
        $sort: { totalDurationSeconds: -1 }
      },
      {
        $limit: 5
      },
      {
        $addFields: {
          // Saniyeyi HH:MM:SS formatına geri çevir
          hours: { $floor: { $divide: ['$totalDurationSeconds', 3600] } },
          remainingSeconds: { $mod: ['$totalDurationSeconds', 3600] },
        }
      },
      {
        $addFields: {
          minutes: { $floor: { $divide: ['$remainingSeconds', 60] } },
          seconds: { $mod: ['$remainingSeconds', 60] }
        }
      },
      {
        $project: {
          login: '$_id',
          totalDuration: {
            $concat: [
              { $cond: [{ $lt: ['$hours', 10] }, { $concat: ['0', { $toString: '$hours' }] }, { $toString: '$hours' }] },
              ':',
              { $cond: [{ $lt: ['$minutes', 10] }, { $concat: ['0', { $toString: '$minutes' }] }, { $toString: '$minutes' }] },
              ':',
              { $cond: [{ $lt: ['$seconds', 10] }, { $concat: ['0', { $toString: '$seconds' }] }, { $toString: '$seconds' }] }
            ]
          },
          totalDurationSeconds: 1
        }
      }
      ]),

      // Tüm zamanlar en çok proje teslim edenler
      Project.aggregate([
        {
          $match: {
            ...campusFilter,
            score: { $gt: 0 }
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
      ]),

      // Tüm zamanlar en yüksek wallet
      Student.find({ 
        ...campusFilter,
        wallet: { $exists: true, $ne: null } 
      })
        .select('login wallet')
        .sort({ wallet: -1 })
        .limit(5)
        .lean(),

      // Tüm zamanlar en yüksek evaluation points
      Student.find({ 
        ...campusFilter,
        correction_point: { $exists: true, $ne: null } 
      })
        .select('login correction_point')
        .sort({ correction_point: -1 })
        .limit(5)
        .lean(),

      // Tüm zamanlar en yüksek level
      Student.find({ 
        ...campusFilter,
        level: { $exists: true, $ne: null } 
      })
        .select('login level')
        .sort({ level: -1 })
        .limit(5)
        .lean()
    ]);

    // TÜM LOGİNLERİ TOPLA (tekrarsız)
    const allLogins = new Set<string>();
    
    topProjectSubmitters.forEach((s: { _id: string }) => allLogins.add(s._id));
    topLocationStats.forEach((s: { login: string }) => allLogins.add(s.login));
    allTimeProjects.forEach((s: { _id: string }) => allLogins.add(s._id));
    allTimeWallet.forEach((s: Record<string, unknown>) => allLogins.add(s.login as string));
    allTimePoints.forEach((s: Record<string, unknown>) => allLogins.add(s.login as string));
    allTimeLevels.forEach((s: Record<string, unknown>) => allLogins.add(s.login as string));

    const uniqueLogins = Array.from(allLogins);

    // TEK SEFERDE TÜM STUDENT BİLGİLERİNİ ÇEK
    const [allStudents, allPatronage, allProjects] = await Promise.all([
      Student.find({ login: { $in: uniqueLogins } })
        .select('login displayname image correction_point wallet grade level has_cheats cheat_count')
        .lean(),
      Patronage.find({ login: { $in: uniqueLogins } })
        .select('login godfathers children')
        .lean(),
      Project.find({ login: { $in: uniqueLogins } })
        .select('login project score status date')
        .sort({ date: -1 })
        .lean()
    ]);

    // Patronage'ı merge et
    const studentsWithPatronage = allStudents.map(student => {
      const patronage = allPatronage.find((p: Record<string, unknown>) => p.login === student.login);
      return {
        ...student,
        patronage: patronage || null
      };
    });

    // Helper: Login'e göre student bul
    const getStudentWithProjects = (login: string) => {
      const student = studentsWithPatronage.find((s: Record<string, unknown>) => s.login === login);
      if (!student) return null;
      const projects = allProjects.filter((p: Record<string, unknown>) => p.login === login);
      return {
        ...student,
        projects: projects
      };
    };

    // Top submitters için student bilgilerini merge et
    const topSubmitters = topProjectSubmitters.map((proj: Record<string, unknown>) => ({
      login: proj._id,
      projectCount: proj.projectCount,
      totalScore: proj.totalScore,
      projects: proj.projects,
      student: getStudentWithProjects(proj._id as string)
    }));

    // Top location stats için student bilgilerini merge et
    const topLocations = topLocationStats.map((loc: Record<string, unknown>) => ({
      login: loc.login,
      totalDuration: loc.totalDuration,
      student: getStudentWithProjects(loc.login as string)
    }));

    // All time projects için student bilgilerini merge et
    const allTimeProjectsWithStudents = allTimeProjects.map((proj: Record<string, unknown>) => ({
      login: proj._id,
      projectCount: proj.projectCount,
      totalScore: proj.totalScore,
      student: getStudentWithProjects(proj._id as string)
    }));

    // All time wallet için student bilgilerini merge et
    const allTimeWalletFormatted = allTimeWallet.map((student: Record<string, unknown>) => ({
      login: student.login,
      wallet: student.wallet,
      student: getStudentWithProjects(student.login as string)
    }));

    // All time points için student bilgilerini merge et
    const allTimePointsFormatted = allTimePoints.map((student: Record<string, unknown>) => ({
      login: student.login,
      correctionPoint: student.correction_point,
      student: getStudentWithProjects(student.login as string)
    }));

    // All time levels için student bilgilerini merge et
    const allTimeLevelsFormatted = allTimeLevels.map((student: Record<string, unknown>) => ({
      login: student.login,
      level: student.level,
      student: getStudentWithProjects(student.login as string)
    }));

    return res.status(200).json({
      currentMonth,
      topProjectSubmitters: topSubmitters,
      topLocationStats: topLocations,
      allTimeProjects: allTimeProjectsWithStudents,
      allTimeWallet: allTimeWalletFormatted,
      allTimePoints: allTimePointsFormatted,
      allTimeLevels: allTimeLevelsFormatted
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
