import type { VercelRequest, VercelResponse } from '@vercel/node';
import { executeQuery, getKeyspace } from '../../utils/couchbase.js';

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
    // Vercel dynamic route: /api/students/[login] -> req.query.login
    const loginParam = req.query.login;
    const login = Array.isArray(loginParam) ? loginParam[0] : loginParam;

    if (!login || typeof login !== 'string') {
      return res.status(400).json({ error: 'Login parameter is required' });
    }

    const studentsKeyspace = getKeyspace('students');
    const projectsKeyspace = getKeyspace('projects');
    const locationStatsKeyspace = getKeyspace('locationstats');
    const feedbacksKeyspace = getKeyspace('feedbacks');

    // Student bilgisini getir (case-insensitive search)
    const studentQuery = `
      SELECT *
      FROM ${studentsKeyspace}
      WHERE LOWER(login) = LOWER($login)
      LIMIT 1
    `;

    const studentResult = await executeQuery(studentQuery, {
      parameters: { login }
    });

    if (!studentResult.rows || studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found', login });
    }

    const student = studentResult.rows[0] as any;

    // Student'a ait projeleri getir - TÜM PROJELERİ
    const projectsQuery = `
      SELECT project, score, date, status
      FROM ${projectsKeyspace}
      WHERE login = $login
      ORDER BY date DESC
    `;

    const projectsResult = await executeQuery(projectsQuery, {
      parameters: { login }
    });

    const projects = projectsResult.rows as any[];

    // Feedback count and average rating
    const feedbackQuery = `
      SELECT 
        COUNT(*) AS feedbackCount,
        AVG(rating) AS avgRating
      FROM ${feedbacksKeyspace}
      WHERE login = $login
    `;

    const feedbackResult = await executeQuery(feedbackQuery, {
      parameters: { login }
    });

    const feedbackData = feedbackResult.rows[0] as any;
    const feedbackCount = feedbackData?.feedbackCount || 0;
    const avgRating = feedbackData?.avgRating || 0;

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
    
    // LocationStats getir
    const locationStatsQuery = `
      SELECT *
      FROM ${locationStatsKeyspace}
      WHERE login = $login
      LIMIT 1
    `;

    const locationStatsResult = await executeQuery(locationStatsQuery, {
      parameters: { login }
    });

    const locationStatsDoc = locationStatsResult.rows.length > 0 ? locationStatsResult.rows[0] as any : null;
    
    const logTimes: Array<{ date: string; duration: number }> = [];
    
    console.log('LocationStats found:', !!locationStatsDoc);
    
    if (locationStatsDoc) {
      console.log('LocationStats has months:', !!locationStatsDoc.months);
      
      if (locationStatsDoc.months) {
        // Couchbase'de months bir object olarak gelir (Map değil)
        const monthsObj = locationStatsDoc.months || {};
        const monthsKeys = Object.keys(monthsObj);
        console.log('Months object keys:', monthsKeys.length);
        
        // 90 gün önceyi bir kez hesapla (quarterly için)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        console.log('Ninety days ago:', ninetyDaysAgo.toISOString());
        
        // Son 3 ayın verilerini al
        [twoMonthsAgoStr, lastMonthStr, currentMonth].forEach(monthKey => {
          const monthData = monthsObj[monthKey];
          console.log(`Month ${monthKey} data:`, !!monthData);
          
          if (monthData && monthData.days) {
            const daysObj = monthData.days || {};
            const daysKeys = Object.keys(daysObj);
            console.log(`Month ${monthKey} days size:`, daysKeys.length);
            
            let dayCount = 0;
            daysKeys.forEach((day: string) => {
              const duration = daysObj[day];
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
      const monthsObj = locationStatsDoc.months || {};
      Object.keys(monthsObj).forEach((monthKey: string) => {
        const monthData = monthsObj[monthKey];
        if (monthData && monthData.days) {
          const daysObj = monthData.days || {};
          Object.keys(daysObj).forEach((day: string) => {
            const duration = daysObj[day];
            // monthKey ve day'den tam tarih oluştur
            const fullDate = `${monthKey}-${String(day).padStart(2, '0')}`;
            const date = new Date(fullDate);
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
