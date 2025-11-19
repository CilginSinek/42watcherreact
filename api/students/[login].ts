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

    // Vercel dynamic route: /api/students/[login] -> req.query.login
    const loginParam = req.query.login;
    const login = Array.isArray(loginParam) ? loginParam[0] : loginParam;

    if (!login || typeof login !== 'string') {
      return res.status(400).json({ error: 'Login parameter is required' });
    }

    // Student bilgisini getir (case-insensitive search)
    const student = await Student.findOne({ 
      login: { $regex: new RegExp(`^${login}$`, 'i') } 
    }).lean();

    if (!student) {
      return res.status(404).json({ error: 'Student not found', login });
    }

    // Student'a ait projeleri getir - TÜM PROJELERİ
    const projects = await Project.find({ login })
      .select('project score date status')
      .sort({ date: -1 })
      .lean();

    // Location stats (kullanılmıyor ama ileride lazım olabilir)
    // const locationStats = await LocationStats.find({ login })
    //   .select('month duration location')
    //   .sort({ month: -1 })
    //   .limit(12)
    //   .lean();

    // Feedback bilgisi (kullanılmıyor ama ileride lazım olabilir)
    // const feedbacks = await Feedback.find({ login })
    //   .select('rating comment date')
    //   .sort({ date: -1 })
    //   .limit(10)
    //   .lean();

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

    // Project count hesapla
    const project_count = projects.length;
    
    // Evo performance hesapla (avgRating * 10 + feedbackCount)
    const evoPerformance = avgRating ? Math.round((avgRating * 10) + feedbackCount) : null;

    // Log times için LocationStats months verisinden son 90 günü çıkar (quarterly için 3 ay)
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const twoMonthsAgoStr = `${twoMonthsAgo.getFullYear()}-${String(twoMonthsAgo.getMonth() + 1).padStart(2, '0')}`;
    
    const locationStatsDoc = await LocationStats.findOne({ login });
    
    const logTimes: Array<{ date: string; duration: number }> = [];
    
    console.log('LocationStats found:', !!locationStatsDoc);
    
    if (locationStatsDoc) {
      console.log('LocationStats has months:', !!locationStatsDoc.months);
      
      if (locationStatsDoc.months) {
        // Map size'ı kontrol et
        console.log('Months Map size:', locationStatsDoc.months.size);
        
        // 90 gün önceyi bir kez hesapla (quarterly için)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        console.log('Ninety days ago:', ninetyDaysAgo.toISOString());
        
        // Son 3 ayın verilerini al
        [twoMonthsAgoStr, lastMonthStr, currentMonth].forEach(monthKey => {
          const monthData = locationStatsDoc.months.get(monthKey);
          console.log(`Month ${monthKey} data:`, !!monthData);
          
          if (monthData && monthData.days) {
            console.log(`Month ${monthKey} days size:`, monthData.days.size);
            
            let dayCount = 0;
            monthData.days.forEach((duration: string, day: string) => {
              // monthKey: "2025-10", day: "15" -> "2025-10-15"
              const fullDate = `${monthKey}-${String(day).padStart(2, '0')}`;
              const date = new Date(fullDate);
              
              console.log(`Checking day ${day}, fullDate: ${fullDate}, is after ninetyDaysAgo: ${date >= ninetyDaysAgo}`);
              
              if (date >= ninetyDaysAgo) {
                dayCount++;
                // Duration HH:MM:SS formatından saniyeye çevir
                const parts = duration.split(':');
                const seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
                logTimes.push({ date: fullDate, duration: seconds });
              }
            });
            console.log(`Month ${monthKey} added ${dayCount} days to logTimes`);
          }
        });
      }
    }
    
    console.log('Total logTimes entries:', logTimes.length);
    
    // Tarihe göre sırala
    logTimes.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Attendance days (haftalık ortalama) - tüm months verisinden hesapla
    const dayStats: { [key: number]: { totalSeconds: number; count: number } } = {};
    
    if (locationStatsDoc && locationStatsDoc.months) {
      locationStatsDoc.months.forEach((monthData: { days?: Map<string, string>; totalDuration?: string }) => {
        if (monthData.days) {
          monthData.days.forEach((duration: string, day: string) => {
            const date = new Date(day);
            const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
          
            // Duration HH:MM:SS formatından saniyeye çevir
            const parts = duration.split(':');
            const seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
            
            if (!dayStats[dayOfWeek]) {
              dayStats[dayOfWeek] = { totalSeconds: 0, count: 0 };
            }
            dayStats[dayOfWeek].totalSeconds += seconds;
            dayStats[dayOfWeek].count += 1;
          });
        }
      });
    }    // Ortalamayı hesapla ve formatla
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const attendanceDays = dayNames.map((dayName, dayOfWeek) => {
      const stats = dayStats[dayOfWeek];
      const avgHours = stats ? stats.totalSeconds / stats.count / 3600 : 0;
      return {
        day: dayName,
        avgHours: Math.round(avgHours * 10) / 10 // 1 ondalık basamak
      };
    });

    // Student objesini düzgün serialize et
    const studentData = {
      ...student,
      projects,
      project_count,
      feedbackCount,
      avgRating,
      evoPerformance,
      logTimes,
      attendanceDays
    };

    return res.status(200).json({
      student: studentData
    });

  } catch (error) {
    console.error('Error fetching student details:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
