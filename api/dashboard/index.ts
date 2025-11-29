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
    // Query parametrelerini al
    const campusIdParam = req.query.campusId as string | undefined;
    
    // Campus filter oluştur
    const campusId = campusIdParam && campusIdParam !== 'all' 
      ? parseInt(campusIdParam) 
      : null;

    // Tarih hesaplamaları
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    // Son 3 ay için tarih aralığı
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const threeMonthsAgoStr = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

    const studentsKeyspace = getKeyspace('students');
    const projectsKeyspace = getKeyspace('projects');
    const locationStatsKeyspace = getKeyspace('locationstats');
    const patronagesKeyspace = getKeyspace('patronages');
    const feedbacksKeyspace = getKeyspace('feedbacks');

    // TÜM AGGREGATİONLARI PARALEL ÇALIŞTIR
    const [
      topProjectSubmitters,
      topLocationStats,
      allTimeProjects,
      allTimeWallet,
      allTimePoints,
      allTimeLevels,
      gradeDistribution,
      weeklyOccupancyData
    ] = await Promise.all([
      // Bu ay en çok proje teslim edenler
      (async () => {
        const campusFilter = campusId ? 'AND campusId = $campusId' : '';
        const queryParams: any = {
          monthStart: monthStart.toISOString().split('T')[0],
          monthEnd: monthEnd.toISOString().split('T')[0]
        };
        if (campusId) {
          queryParams.campusId = campusId;
        }
        const query = `
          SELECT 
            login AS _id,
            COUNT(*) AS projectCount,
            SUM(score) AS totalScore,
            ARRAY_AGG({
              "project": project,
              "score": score,
              "date": date
            }) AS projects
          FROM ${projectsKeyspace}
          WHERE date >= $monthStart 
            AND date <= $monthEnd
            AND score > 0
            ${campusFilter}
          GROUP BY login
          ORDER BY projectCount DESC, totalScore DESC
          LIMIT 5
        `;
        const result = await executeQuery(query, {
          parameters: queryParams
        });
        return result.rows;
      })(),
      
      // Son 3 ay en çok kampüste kalanlar
      (async () => {
        // N1QL'de object'leri iterate etmek için JavaScript'te yapılacak
        // Önce tüm locationStats'ı çek
        const campusFilter = campusId ? 'WHERE campusId = $campusId' : '';
        const queryParams: any = {};
        if (campusId) {
          queryParams.campusId = campusId;
        }
        const query = `
          SELECT login, campusId, months
          FROM ${locationStatsKeyspace}
          ${campusFilter}
        `;
        const result = await executeQuery(query, {
          parameters: queryParams
        });
        
        // JavaScript'te işle
        const locationStatsMap = new Map<string, number>();
        
        for (const row of result.rows as any[]) {
          if (!row.months) continue;
          
          const months = row.months;
          let totalSeconds = 0;
          
          for (const monthKey of Object.keys(months)) {
            if (monthKey < threeMonthsAgoStr) continue;
            
            const monthData = months[monthKey];
            if (!monthData || !monthData.totalDuration) continue;
            
            // HH:MM:SS formatından saniyeye çevir
            const parts = monthData.totalDuration.split(':');
            const seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
            totalSeconds += seconds;
          }
          
          if (totalSeconds > 0) {
            locationStatsMap.set(row.login, totalSeconds);
          }
        }
        
        // Top 5'i al ve formatla
        const sorted = Array.from(locationStatsMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
        
        return sorted.map(([login, totalDurationSeconds]) => {
          const hours = Math.floor(totalDurationSeconds / 3600);
          const remainingSeconds = totalDurationSeconds % 3600;
          const minutes = Math.floor(remainingSeconds / 60);
          const seconds = remainingSeconds % 60;
          
          const formatTime = (num: number) => num < 10 ? `0${num}` : `${num}`;
          
          return {
            login,
            totalDuration: `${formatTime(hours)}:${formatTime(minutes)}:${formatTime(seconds)}`,
            totalDurationSeconds
          };
        });
      })(),

      // Tüm zamanlar en çok proje teslim edenler
      (async () => {
        const campusFilter = campusId ? 'AND campusId = $campusId' : '';
        const queryParams: any = {};
        if (campusId) {
          queryParams.campusId = campusId;
        }
        const query = `
          SELECT 
            login AS _id,
            COUNT(*) AS projectCount,
            SUM(score) AS totalScore
          FROM ${projectsKeyspace}
          WHERE score > 0
            ${campusFilter}
          GROUP BY login
          ORDER BY projectCount DESC, totalScore DESC
          LIMIT 5
        `;
        const result = await executeQuery(query, {
          parameters: queryParams
        });
        return result.rows;
      })(),

      // Tüm zamanlar en yüksek wallet
      (async () => {
        const campusFilter = campusId ? 'WHERE campusId = $campusId' : 'WHERE wallet IS NOT NULL';
        const queryParams: any = {};
        if (campusId) {
          queryParams.campusId = campusId;
        }
        const query = `
          SELECT login, wallet
          FROM ${studentsKeyspace}
          ${campusFilter}
            AND wallet IS NOT NULL
          ORDER BY wallet DESC
          LIMIT 5
        `;
        const result = await executeQuery(query, {
          parameters: queryParams
        });
        return result.rows;
      })(),

      // Tüm zamanlar en yüksek evaluation points
      (async () => {
        const campusFilter = campusId ? 'WHERE campusId = $campusId' : 'WHERE correction_point IS NOT NULL';
        const queryParams: any = {};
        if (campusId) {
          queryParams.campusId = campusId;
        }
        const query = `
          SELECT login, correction_point
          FROM ${studentsKeyspace}
          ${campusFilter}
            AND correction_point IS NOT NULL
          ORDER BY correction_point DESC
          LIMIT 5
        `;
        const result = await executeQuery(query, {
          parameters: queryParams
        });
        return result.rows;
      })(),

      // Tüm zamanlar en yüksek level
      (async () => {
        const campusFilter = campusId ? 'WHERE campusId = $campusId' : 'WHERE level IS NOT NULL';
        const queryParams: any = {};
        if (campusId) {
          queryParams.campusId = campusId;
        }
        const query = `
          SELECT login, level
          FROM ${studentsKeyspace}
          ${campusFilter}
            AND level IS NOT NULL
          ORDER BY level DESC
          LIMIT 5
        `;
        const result = await executeQuery(query, {
          parameters: queryParams
        });
        return result.rows;
      })(),

      // Grade distribution
      (async () => {
        const campusFilter = campusId ? 'AND campusId = $campusId' : '';
        const queryParams: any = {};
        if (campusId) {
          queryParams.campusId = campusId;
        }
        const query = `
          SELECT 
            grade AS name,
            COUNT(*) AS value
          FROM ${studentsKeyspace}
          WHERE \`active?\` = true
            AND grade IS NOT NULL
            AND grade != ""
            ${campusFilter}
          GROUP BY grade
          ORDER BY grade ASC
        `;
        const result = await executeQuery(query, {
          parameters: queryParams
        });
        return result.rows;
      })(),

      // Weekly occupancy - son 90 günün günlük ortalama doluluk verileri
      (async () => {
        // N1QL'de object iteration için JavaScript kullan
        const campusFilter = campusId ? 'WHERE campusId = $campusId' : '';
        const queryParams: any = {};
        if (campusId) {
          queryParams.campusId = campusId;
        }
        const query = `
          SELECT months
          FROM ${locationStatsKeyspace}
          ${campusFilter}
        `;
        const result = await executeQuery(query, {
          parameters: queryParams
        });
        
        const dayOfWeekCounts: { [key: number]: number } = {};
        
        for (const row of result.rows as any[]) {
          if (!row.months) continue;
          
          for (const monthKey of Object.keys(row.months)) {
            if (monthKey < threeMonthsAgoStr) continue;
            
            const monthData = row.months[monthKey];
            if (!monthData || !monthData.days) continue;
            
            for (const day of Object.keys(monthData.days)) {
              const fullDate = `${monthKey}-${String(day).padStart(2, '0')}`;
              const date = new Date(fullDate);
              const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
              
              dayOfWeekCounts[dayOfWeek] = (dayOfWeekCounts[dayOfWeek] || 0) + 1;
            }
          }
        }
        
        return Object.keys(dayOfWeekCounts).map(dayOfWeek => ({
          dayOfWeek: parseInt(dayOfWeek),
          avgOccupancy: dayOfWeekCounts[parseInt(dayOfWeek)]
        })).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
      })()
    ]);

    // TÜM LOGİNLERİ TOPLA (tekrarsız)
    const allLogins = new Set<string>();
    
    topProjectSubmitters.forEach((s: any) => allLogins.add(s._id));
    topLocationStats.forEach((s: any) => allLogins.add(s.login));
    allTimeProjects.forEach((s: any) => allLogins.add(s._id));
    allTimeWallet.forEach((s: any) => allLogins.add(s.login));
    allTimePoints.forEach((s: any) => allLogins.add(s.login));
    allTimeLevels.forEach((s: any) => allLogins.add(s.login));

    const uniqueLogins = Array.from(allLogins);

    // TEK SEFERDE TÜM STUDENT BİLGİLERİNİ ÇEK - SADECE GEREKEN BİLGİLER
    const [allStudents, allPatronage, allProjects, allFeedbacks] = await Promise.all([
      (async () => {
        if (uniqueLogins.length === 0) return [];
        const placeholders = uniqueLogins.map((_, i) => `$login${i}`).join(', ');
        const query = `
          SELECT login, displayname, image, correction_point, wallet, grade, level, has_cheats, cheat_count
          FROM ${studentsKeyspace}
          WHERE login IN [${placeholders}]
        `;
        const params: any = {};
        uniqueLogins.forEach((login, i) => {
          params[`login${i}`] = login;
        });
        const result = await executeQuery(query, { parameters: params });
        return result.rows;
      })(),
      (async () => {
        if (uniqueLogins.length === 0) return [];
        const placeholders = uniqueLogins.map((_, i) => `$login${i}`).join(', ');
        const query = `
          SELECT login, godfathers, children
          FROM ${patronagesKeyspace}
          WHERE login IN [${placeholders}]
        `;
        const params: any = {};
        uniqueLogins.forEach((login, i) => {
          params[`login${i}`] = login;
        });
        const result = await executeQuery(query, { parameters: params });
        return result.rows;
      })(),
      // Sadece top 3 projeyi al her öğrenci için (dashboard'da çok proje göstermiyoruz)
      (async () => {
        if (uniqueLogins.length === 0) return [];
        // N1QL'de array slice için JavaScript kullan
        const placeholders = uniqueLogins.map((_, i) => `$login${i}`).join(', ');
        const query = `
          SELECT login, project, score, status, date
          FROM ${projectsKeyspace}
          WHERE login IN [${placeholders}]
          ORDER BY login, date DESC, score DESC
        `;
        const params: any = {};
        uniqueLogins.forEach((login, i) => {
          params[`login${i}`] = login;
        });
        const result = await executeQuery(query, { parameters: params });
        
        // Group by login and take top 3
        const grouped: { [key: string]: any[] } = {};
        for (const row of result.rows as any[]) {
          if (!grouped[row.login]) {
            grouped[row.login] = [];
          }
          if (grouped[row.login].length < 3) {
            grouped[row.login].push({
              project: row.project,
              score: row.score,
              status: row.status,
              date: row.date
            });
          }
        }
        
        return Object.keys(grouped).map(login => ({
          login,
          projects: grouped[login]
        }));
      })(),
      (async () => {
        if (uniqueLogins.length === 0) return [];
        const placeholders = uniqueLogins.map((_, i) => `$login${i}`).join(', ');
        const query = `
          SELECT login, rating, ratingDetails
          FROM ${feedbacksKeyspace}
          WHERE login IN [${placeholders}]
        `;
        const params: any = {};
        uniqueLogins.forEach((login, i) => {
          params[`login${i}`] = login;
        });
        const result = await executeQuery(query, { parameters: params });
        return result.rows;
      })()
    ]);

    // Patronage ve Feedback'leri merge et
    const studentsWithPatronage = allStudents.map(student => {
      const patronage = allPatronage.find((p: Record<string, unknown>) => p.login === student.login);
      const feedbacks = allFeedbacks.filter((f: Record<string, unknown>) => f.login === student.login);
      
      // Feedback metrics hesapla
      let feedbackCount = 0;
      let avgRating = null;
      let avgRatingDetails = null;
      
      if (feedbacks.length > 0) {
        feedbackCount = feedbacks.length;
        
        // Average rating hesapla
        const totalRating = feedbacks.reduce((sum: number, f: Record<string, unknown>) => 
          sum + (f.rating as number || 0), 0);
        avgRating = totalRating / feedbackCount;
        
        // Average rating details hesapla
        const totalNice = feedbacks.reduce((sum: number, f: Record<string, unknown>) => 
          sum + ((f.ratingDetails as Record<string, number>)?.nice || 0), 0);
        const totalRigorous = feedbacks.reduce((sum: number, f: Record<string, unknown>) => 
          sum + ((f.ratingDetails as Record<string, number>)?.rigorous || 0), 0);
        const totalInterested = feedbacks.reduce((sum: number, f: Record<string, unknown>) => 
          sum + ((f.ratingDetails as Record<string, number>)?.interested || 0), 0);
        const totalPunctuality = feedbacks.reduce((sum: number, f: Record<string, unknown>) => 
          sum + ((f.ratingDetails as Record<string, number>)?.punctuality || 0), 0);
        
        avgRatingDetails = {
          nice: totalNice / feedbackCount,
          rigorous: totalRigorous / feedbackCount,
          interested: totalInterested / feedbackCount,
          punctuality: totalPunctuality / feedbackCount
        };
      }
      
      return {
        ...student,
        patronage: patronage || null,
        feedbackCount,
        avgRating,
        avgRatingDetails,
        evoPerformance: avgRating ? (avgRating * 10) + feedbackCount : null
      };
    });

    // Helper: Login'e göre student bul
    const getStudentWithProjects = (login: string) => {
      const student = studentsWithPatronage.find((s: Record<string, unknown>) => s.login === login);
      if (!student) return null;
      
      // allProjects artık aggregation sonucu, doğru yapıya sahip
      const projectData = (allProjects as unknown as Array<{ login: string; projects: Array<Record<string, unknown>> }>)
        .find((p) => p.login === login);
      
      return {
        ...student,
        projects: projectData?.projects || []
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

    // Hourly occupancy - 24 saatlik veri (simulated - gerçek veri için location tracking'e saat bilgisi eklemek gerek)
    const hourlyOccupancy = Array.from({ length: 24 }, (_, i) => {
      const hour = i.toString().padStart(2, '0');
      // Basit simülasyon: sabah 8-18 arası yoğun, gece düşük
      let occupancy = 0;
      if (i >= 8 && i <= 18) {
        occupancy = Math.floor(50 + Math.random() * 40); // 50-90 arası
      } else if (i >= 19 && i <= 23) {
        occupancy = Math.floor(20 + Math.random() * 30); // 20-50 arası
      } else {
        occupancy = Math.floor(5 + Math.random() * 15); // 5-20 arası
      }
      return { hour: `${hour}:00`, occupancy };
    });

    // Weekly occupancy - haftanın günlerine göre
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyOccupancy = dayNames.map((day, index) => {
      const dayData = weeklyOccupancyData.find((d: { dayOfWeek: number }) => d.dayOfWeek === (index + 1));
      // avgOccupancy'yi normalize et (max 100 olacak şekilde)
      const maxOccupancy = Math.max(...weeklyOccupancyData.map((d: { avgOccupancy: number }) => d.avgOccupancy || 1), 1);
      const occupancy = dayData ? Math.round((dayData.avgOccupancy / maxOccupancy) * 100) : 0;
      return { day, occupancy };
    });

    return res.status(200).json({
      currentMonth,
      topProjectSubmitters: topSubmitters,
      topLocationStats: topLocations,
      allTimeProjects: allTimeProjectsWithStudents,
      allTimeWallet: allTimeWalletFormatted,
      allTimePoints: allTimePointsFormatted,
      allTimeLevels: allTimeLevelsFormatted,
      gradeDistribution,
      hourlyOccupancy,
      weeklyOccupancy
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
