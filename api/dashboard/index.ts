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
      gradeDistribution
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
        // OPTIMIZED: Sadece son 3 ay için gerekli verileri çek
        const campusFilter = campusId ? 'WHERE campusId = $campusId' : '';
        const queryParams: any = {};
        if (campusId) {
          queryParams.campusId = campusId;
        }
        // Sadece months field'ını çek, diğer field'ları çekme
        const query = `
          SELECT login, months
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
        const campusFilter = campusId ? 'WHERE campusId = $campusId' : 'WHERE `level` IS NOT NULL';
        const queryParams: any = {};
        if (campusId) {
          queryParams.campusId = campusId;
        }
        const query = `
          SELECT login, \`level\`
          FROM ${studentsKeyspace}
          ${campusFilter}
            AND \`level\` IS NOT NULL
          ORDER BY \`level\` DESC
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
            COUNT(*) AS \`value\`
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
          SELECT login, displayname, image, correction_point, wallet, grade, \`level\`, has_cheats, cheat_count
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

    // Hourly occupancy - 24 saatlik veri (database'den - eski hali geri getirildi)
    const hourlyOccupancyQuery = `
      SELECT months
      FROM ${locationStatsKeyspace}
      ${campusId ? 'WHERE campusId = $campusId' : ''}
    `;
    const hourlyParams: any = {};
    if (campusId) {
      hourlyParams.campusId = campusId;
    }
    const hourlyResult = await executeQuery(hourlyOccupancyQuery, {
      parameters: hourlyParams
    });

    // Son 30 günün verilerini kullan
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const hourlyCounts: { [key: number]: number } = {};
    
    for (const row of hourlyResult.rows as any[]) {
      if (!row.months) continue;
      
      for (const monthKey of Object.keys(row.months)) {
        const monthData = row.months[monthKey];
        if (!monthData || !monthData.days) continue;
        
        for (const day of Object.keys(monthData.days)) {
          const fullDate = `${monthKey}-${String(day).padStart(2, '0')}`;
          const date = new Date(fullDate);
          
          // Son 30 gün içindeyse
          if (date >= thirtyDaysAgo) {
            const dayOfWeek = date.getDay();
            const duration = monthData.days[day];
            
            // Duration'dan saniye hesapla
            const parts = duration.split(':');
            const totalSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
            
            // Günlük ortalama süreyi saatlere dağıt (basit bir model)
            // Hafta içi: 8-18 arası yoğun, hafta sonu: 10-16 arası yoğun
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const activeHours = isWeekend ? [10, 11, 12, 13, 14, 15, 16] : [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
            
            // Her aktif saat için eşit dağıt (basitleştirilmiş model)
            const secondsPerHour = totalSeconds / activeHours.length;
            
            for (let hour = 0; hour < 24; hour++) {
              if (activeHours.includes(hour)) {
                hourlyCounts[hour] = (hourlyCounts[hour] || 0) + secondsPerHour;
              }
            }
          }
        }
      }
    }

    // Normalize et ve formatla
    const maxHourlyCount = Math.max(...Object.values(hourlyCounts), 1);
    const hourlyOccupancy = Array.from({ length: 24 }, (_, i) => {
      const hour = i.toString().padStart(2, '0');
      const occupancy = hourlyCounts[i] 
        ? Math.round((hourlyCounts[i] / maxHourlyCount) * 100)
        : 0;
      return { hour: `${hour}:00`, occupancy };
    });

    // Weekly occupancy - haftanın günlerine göre
    const weeklyOccupancyQuery = `
      SELECT months
      FROM ${locationStatsKeyspace}
      ${campusId ? 'WHERE campusId = $campusId' : ''}
    `;
    const weeklyParams: any = {};
    if (campusId) {
      weeklyParams.campusId = campusId;
    }
    const weeklyResult = await executeQuery(weeklyOccupancyQuery, {
      parameters: weeklyParams
    });
    
    const dayOfWeekCounts: { [key: number]: number } = {};
    
    for (const row of weeklyResult.rows as any[]) {
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
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const maxWeeklyCount = Math.max(...Object.values(dayOfWeekCounts), 1);
    const weeklyOccupancy = dayNames.map((day, index) => {
      const count = dayOfWeekCounts[index] || 0;
      const occupancy = count ? Math.round((count / maxWeeklyCount) * 100) : 0;
      return { day, occupancy };
    });

    // Performance Trend - Son 4 haftanın proje teslim sayıları
    // Son 28 günün projelerini çek ve JavaScript'te haftalara böl
    const twentyEightDaysAgo = new Date();
    twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
    const performanceTrendQuery = `
      SELECT date
      FROM ${projectsKeyspace}
      WHERE date >= $dateStart
        AND score > 0
        ${campusId ? 'AND campusId = $campusId' : ''}
    `;
    const performanceParams: any = {
      dateStart: twentyEightDaysAgo.toISOString().split('T')[0]
    };
    if (campusId) {
      performanceParams.campusId = campusId;
    }
    const performanceResult = await executeQuery(performanceTrendQuery, {
      parameters: performanceParams
    });
    
    // Son 4 haftayı oluştur
    const weeklyCounts: { [key: number]: number } = {};
    
    // Her projeyi haftasına göre say
    for (const row of performanceResult.rows as any[]) {
      const projectDate = new Date(row.date);
      const daysDiff = Math.floor((now.getTime() - projectDate.getTime()) / (1000 * 60 * 60 * 24));
      const weekNumber = Math.floor(daysDiff / 7);
      
      // Son 4 hafta (0-3)
      if (weekNumber >= 0 && weekNumber < 4) {
        weeklyCounts[weekNumber] = (weeklyCounts[weekNumber] || 0) + 1;
      }
    }
    
    const performanceTrend = [];
    for (let i = 3; i >= 0; i--) {
      performanceTrend.push({
        name: `Week ${4 - i}`,
        value: weeklyCounts[i] || 0
      });
    }

    // weeklyOccupancy artık yukarıda hesaplandı, weeklyOccupancyData kullanılmıyor

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
      weeklyOccupancy,
      performanceTrend
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
