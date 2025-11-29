import type { VercelRequest, VercelResponse } from '@vercel/node';
import { executeQuery, getKeyspace } from '../../utils/couchbase.js';

/**
 * REQUIRED INDEXES FOR OPTIMAL PERFORMANCE:
 * 
 * Students collection:
 *   db.students.createIndex({ login: 1 })
 *   db.students.createIndex({ campusId: 1 })
 *   db.students.createIndex({ login: 1, campusId: 1 })
 *   db.students.createIndex({ correction_point: -1 })
 *   db.students.createIndex({ wallet: -1 })
 *   db.students.createIndex({ level: -1 })
 *   db.students.createIndex({ created_at: -1 })
 * 
 * Projects collection:
 *   db.projects.createIndex({ login: 1 })
 *   db.projects.createIndex({ login: 1, status: 1, score: 1 })
 * 
 * Patronages collection:
 *   db.patronages.createIndex({ login: 1 })
 * 
 * LocationStats collection:
 *   db.locationstats.createIndex({ login: 1 })
 */

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
    const studentsKeyspace = getKeyspace('students');
    const projectsKeyspace = getKeyspace('projects');
    const patronagesKeyspace = getKeyspace('patronages');
    const locationStatsKeyspace = getKeyspace('locationstats');
    const feedbacksKeyspace = getKeyspace('feedbacks');

    // small helper to safely escape user input used in regex
    const escapeRegex = (str: string) => {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    // Query parametreleri
    const { 
      search, 
      status,
      campusId,
      poolMonth,
      poolYear,
      sortBy = 'login',
      order = 'asc',
      limit = '100',
      page = '1'
    } = req.query;

    // N1QL WHERE clause oluştur
    const whereConditions: string[] = [];

    // Campus filter
    if (campusId && typeof campusId === 'string') {
      whereConditions.push(`campusId = ${parseInt(campusId)}`);
    }

    // Build parameters object for N1QL queries
    const queryParams: any = {};

    // Pool month filter
    if (poolMonth && typeof poolMonth === 'string') {
      whereConditions.push('LOWER(pool_month) = LOWER($poolMonth)');
      queryParams.poolMonth = poolMonth;
    }

    // Pool year filter
    if (poolYear && typeof poolYear === 'string') {
      whereConditions.push('pool_year = $poolYear');
      queryParams.poolYear = poolYear;
    }

    // Search filter (use parameters to prevent injection)
    if (search && typeof search === 'string') {
      whereConditions.push(`(
        LOWER(login) LIKE LOWER($search) OR
        LOWER(displayname) LIKE LOWER($search) OR
        LOWER(email) LIKE LOWER($search)
      )`);
      queryParams.search = `%${search}%`;
    }

    // Status filter
    let cheaterLogins: string[] = [];
    if (status && typeof status === 'string') {
      switch (status) {
        case 'staff':
          whereConditions.push('`staff?` = true');
          break;
        case 'blackholed':
          whereConditions.push('blackholed = true');
          break;
        case 'sinker':
          whereConditions.push('sinker = true');
          break;
        case 'freeze':
          whereConditions.push('freeze = true');
          break;
        case 'transcender':
          whereConditions.push('grade = "Transcender"');
          break;
        case 'cadet':
          whereConditions.push('grade = "Cadet"');
          break;
        case 'piscine':
          whereConditions.push('grade = "Piscine"');
          break;
        case 'alumni':
          whereConditions.push('`alumni?` = true');
          break;
        case 'active':
          whereConditions.push('`active?` = true AND (`alumni?` IS NULL OR `alumni?` = false)');
          break;
        case 'inactive':
          whereConditions.push('`active?` = false AND (`alumni?` IS NULL OR `alumni?` = false)');
          break;
        case 'test':
          whereConditions.push('is_test = true');
          break;
        case 'blackhole':
          whereConditions.push('blackholed = true');
          break;
        case 'transfer':
          whereConditions.push('is_trans = true');
          break;
        case 'cheaters': {
          // Get cheater logins first
          const cheaterQuery = `
            SELECT DISTINCT login
            FROM ${projectsKeyspace}
            WHERE status = "fail" AND score = -42
          `;
          const cheaterResult = await executeQuery(cheaterQuery);
          cheaterLogins = cheaterResult.rows.map((row: any) => row.login);
          if (cheaterLogins.length > 0) {
            // Use parameters for IN clause
            const placeholders = cheaterLogins.map((_, i) => `$cheaterLogin${i}`).join(', ');
            whereConditions.push(`login IN [${placeholders}]`);
            cheaterLogins.forEach((login, i) => {
              queryParams[`cheaterLogin${i}`] = login;
            });
          } else {
            whereConditions.push('1 = 0'); // No results
          }
          break;
        }
      }
    }

    // Pagination
    const limitNum = parseInt(limit as string) || 100;
    const pageNum = parseInt(page as string) || 1;
    const skip = (pageNum - 1) * limitNum;
    const sortOrder = order === 'desc' ? 'DESC' : 'ASC';

    // Sort field mapping
    const sortFieldMap: Record<string, string> = {
      'godfather_count': 'godfatherCount',
      'children_count': 'childrenCount',
      'cheat_count': 'cheatCount',
      'project_count': 'projectCount',
      'log_time': 'logTime',
      'evo_performance': 'evoPerformance',
      'feedback_count': 'feedbackCount',
      'avg_rating': 'avgRating',
      'wallet': 'wallet',
      'correction_point': 'correction_point',
      'level': 'level',
      'login': 'login'
    };

    // Only allow known sort fields; fallback to 'login' for safety
    const actualSortField = sortFieldMap[sortBy as string] ?? 'login';

    // TWO-PHASE AGGREGATION APPROACH
    // Phase 1: Lightweight query to get sorted logins only
    // Phase 2: Detailed data fetch for selected logins only
    
    // PHASE 1: Build WHERE clause
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // PHASE 1: Get all students matching filters and calculate sort values
    // First, get all students matching the filter
    const sortField = actualSortField === 'login' ? 'login' : actualSortField === 'wallet' ? 'wallet' : actualSortField === 'correction_point' ? 'correction_point' : actualSortField === 'level' ? '`level`' : 'login';
    const studentsQuery = `
      SELECT login, ${sortField} AS sortValue
      FROM ${studentsKeyspace}
      ${whereClause}
    `;
    
    const allStudentsResult = await executeQuery(studentsQuery, {
      parameters: queryParams
    });
    let studentsWithSort: Array<{ login: string; sortValue: any }> = allStudentsResult.rows.map((row: any) => ({
      login: row.login,
      sortValue: row.sortValue
    }));

    // Calculate sort values for complex fields - OPTIMIZED: Only fetch for filtered students
    const studentLogins = studentsWithSort.map(s => s.login);
    if (studentLogins.length === 0) {
      return res.status(200).json({
        students: [],
        pagination: {
          total: 0,
          page: pageNum,
          limit: limitNum,
          totalPages: 0
        }
      });
    }

    // Build login parameters for WHERE IN clause
    const loginParamsForSort: any = {};
    const loginPlaceholdersForSort = studentLogins.map((_, i) => `$loginSort${i}`).join(', ');
    studentLogins.forEach((login, i) => {
      loginParamsForSort[`loginSort${i}`] = login;
    });

    if (actualSortField === 'projectCount' || actualSortField === 'cheatCount') {
      const projectStatsQuery = `
        SELECT 
          login,
          SUM(CASE WHEN status = "success" THEN 1 ELSE 0 END) AS projectCount,
          SUM(CASE WHEN status = "fail" AND score = -42 THEN 1 ELSE 0 END) AS cheatCount
        FROM ${projectsKeyspace}
        WHERE login IN [${loginPlaceholdersForSort}]
        GROUP BY login
      `;
      const projectStatsResult = await executeQuery(projectStatsQuery, {
        parameters: loginParamsForSort
      });
      const statsMap = new Map<string, { projectCount: number; cheatCount: number }>();
      for (const row of projectStatsResult.rows as any[]) {
        statsMap.set(row.login, { projectCount: row.projectCount || 0, cheatCount: row.cheatCount || 0 });
      }
      studentsWithSort = studentsWithSort.map(s => ({
        ...s,
        sortValue: actualSortField === 'projectCount' 
          ? (statsMap.get(s.login)?.projectCount || 0)
          : (statsMap.get(s.login)?.cheatCount || 0)
      }));
    } else if (actualSortField === 'godfatherCount' || actualSortField === 'childrenCount') {
      const patronageQuery = `
        SELECT 
          login,
          ARRAY_LENGTH(COALESCE(godfathers, [])) AS godfatherCount,
          ARRAY_LENGTH(COALESCE(children, [])) AS childrenCount
        FROM ${patronagesKeyspace}
        WHERE login IN [${loginPlaceholdersForSort}]
      `;
      const patronageResult = await executeQuery(patronageQuery, {
        parameters: loginParamsForSort
      });
      const statsMap = new Map<string, { godfatherCount: number; childrenCount: number }>();
      for (const row of patronageResult.rows as any[]) {
        statsMap.set(row.login, { godfatherCount: row.godfatherCount || 0, childrenCount: row.childrenCount || 0 });
      }
      studentsWithSort = studentsWithSort.map(s => ({
        ...s,
        sortValue: actualSortField === 'godfatherCount'
          ? (statsMap.get(s.login)?.godfatherCount || 0)
          : (statsMap.get(s.login)?.childrenCount || 0)
      }));
    } else if (actualSortField === 'logTime') {
      const locationQuery = `
        SELECT login, months
        FROM ${locationStatsKeyspace}
        WHERE login IN [${loginPlaceholdersForSort}]
      `;
      const locationResult = await executeQuery(locationQuery, {
        parameters: loginParamsForSort
      });
      const logTimeMap = new Map<string, number>();
      for (const row of locationResult.rows as any[]) {
        if (!row.months) continue;
        let totalSeconds = 0;
        for (const monthKey of Object.keys(row.months)) {
          const monthData = row.months[monthKey];
          if (monthData && monthData.totalDuration) {
            const parts = monthData.totalDuration.split(':');
            totalSeconds += parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
          }
        }
        logTimeMap.set(row.login, totalSeconds);
      }
      studentsWithSort = studentsWithSort.map(s => ({
        ...s,
        sortValue: logTimeMap.get(s.login) || 0
      }));
    } else if (actualSortField === 'evoPerformance' || actualSortField === 'feedbackCount' || actualSortField === 'avgRating') {
      const feedbackQuery = `
        SELECT 
          login,
          COUNT(*) AS feedbackCount,
          AVG(rating) AS avgRating
        FROM ${feedbacksKeyspace}
        WHERE login IN [${loginPlaceholdersForSort}]
        GROUP BY login
      `;
      const feedbackResult = await executeQuery(feedbackQuery, {
        parameters: loginParamsForSort
      });
      const feedbackMap = new Map<string, { feedbackCount: number; avgRating: number }>();
      for (const row of feedbackResult.rows as any[]) {
        feedbackMap.set(row.login, { 
          feedbackCount: row.feedbackCount || 0, 
          avgRating: row.avgRating || 0 
        });
      }
      studentsWithSort = studentsWithSort.map(s => {
        const fb = feedbackMap.get(s.login);
        if (!fb || fb.feedbackCount === 0) return { ...s, sortValue: null };
        return {
          ...s,
          sortValue: actualSortField === 'feedbackCount' 
            ? fb.feedbackCount
            : actualSortField === 'avgRating'
            ? fb.avgRating
            : (fb.avgRating * 10) + fb.feedbackCount // evoPerformance
        };
      });
      // Filter out students without feedback
      studentsWithSort = studentsWithSort.filter(s => s.sortValue !== null);
    }

    // Get total count
    const total = studentsWithSort.length;

    // Sort
    studentsWithSort.sort((a, b) => {
      const aVal = a.sortValue;
      const bVal = b.sortValue;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (order === 'desc') {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      } else {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
    });

    // Paginate
    const paginatedStudents = studentsWithSort.slice(skip, skip + limitNum);
    const loginList = paginatedStudents.map((s, index) => ({ login: s.login, orderIndex: index }));

    if (loginList.length === 0) {
      return res.status(200).json({
        students: [],
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    }

    // PHASE 2: Detailed data fetch for selected logins only
    if (loginList.length === 0) {
      return res.status(200).json({
        students: [],
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    }

    const logins = loginList.map(l => l.login);
    const loginPlaceholders = logins.map((_, i) => `$login${i}`).join(', ');
    const loginParams: any = {};
    logins.forEach((login, i) => {
      loginParams[`login${i}`] = login;
    });

    // Get all data in parallel
    const [studentsData, projectsData, projectStatsData, cheatProjectsData, patronagesData, locationStatsData, feedbacksData] = await Promise.all([
      // Students
      executeQuery(`
        SELECT *
        FROM ${studentsKeyspace}
        WHERE login IN [${loginPlaceholders}]
      `, { parameters: loginParams }),
      // Projects (top 10 per student)
      executeQuery(`
        SELECT login, project, score, status, date
        FROM ${projectsKeyspace}
        WHERE login IN [${loginPlaceholders}]
        ORDER BY login, date DESC
      `, { parameters: loginParams }),
      // Project stats
      executeQuery(`
        SELECT 
          login,
          SUM(CASE WHEN status = "success" THEN 1 ELSE 0 END) AS projectCount,
          SUM(CASE WHEN status = "fail" AND score = -42 THEN 1 ELSE 0 END) AS cheatCount
        FROM ${projectsKeyspace}
        WHERE login IN [${loginPlaceholders}]
        GROUP BY login
      `, { parameters: loginParams }),
      // Cheat projects
      executeQuery(`
        SELECT login, project, score, status, date
        FROM ${projectsKeyspace}
        WHERE login IN [${loginPlaceholders}]
          AND status = "fail"
          AND score = -42
        ORDER BY login, date DESC
      `, { parameters: loginParams }),
      // Patronages
      executeQuery(`
        SELECT 
          login,
          godfathers,
          children,
          ARRAY_LENGTH(COALESCE(godfathers, [])) AS godfatherCount,
          ARRAY_LENGTH(COALESCE(children, [])) AS childrenCount
        FROM ${patronagesKeyspace}
        WHERE login IN [${loginPlaceholders}]
      `, { parameters: loginParams }),
      // LocationStats
      executeQuery(`
        SELECT login, months
        FROM ${locationStatsKeyspace}
        WHERE login IN [${loginPlaceholders}]
      `, { parameters: loginParams }),
      // Feedbacks
      executeQuery(`
        SELECT login, rating, ratingDetails
        FROM ${feedbacksKeyspace}
        WHERE login IN [${loginPlaceholders}]
      `, { parameters: loginParams })
    ]);

    // Build maps for quick lookup
    const projectsMap = new Map<string, any[]>();
    for (const row of projectsData.rows as any[]) {
      if (!projectsMap.has(row.login)) {
        projectsMap.set(row.login, []);
      }
      const projects = projectsMap.get(row.login)!;
      if (projects.length < 10) {
        projects.push({
          project: row.project,
          score: row.score,
          status: row.status,
          date: row.date
        });
      }
    }

    const projectStatsMap = new Map<string, { projectCount: number; cheatCount: number }>();
    for (const row of projectStatsData.rows as any[]) {
      projectStatsMap.set(row.login, {
        projectCount: row.projectCount || 0,
        cheatCount: row.cheatCount || 0
      });
    }

    const cheatProjectsMap = new Map<string, any[]>();
    for (const row of cheatProjectsData.rows as any[]) {
      if (!cheatProjectsMap.has(row.login)) {
        cheatProjectsMap.set(row.login, []);
      }
      cheatProjectsMap.get(row.login)!.push({
        project: row.project,
        score: row.score,
        status: row.status,
        date: row.date
      });
    }

    const patronagesMap = new Map<string, any>();
    for (const row of patronagesData.rows as any[]) {
      patronagesMap.set(row.login, {
        godfathers: row.godfathers || [],
        children: row.children || [],
        godfatherCount: row.godfatherCount || 0,
        childrenCount: row.childrenCount || 0
      });
    }

    const locationStatsMap = new Map<string, any>();
    for (const row of locationStatsData.rows as any[]) {
      locationStatsMap.set(row.login, row.months || {});
    }

    const feedbacksMap = new Map<string, any[]>();
    for (const row of feedbacksData.rows as any[]) {
      if (!feedbacksMap.has(row.login)) {
        feedbacksMap.set(row.login, []);
      }
      feedbacksMap.get(row.login)!.push({
        rating: row.rating,
        ratingDetails: row.ratingDetails
      });
    }

    // Build students array with all calculated fields
    const students = (studentsData.rows as any[]).map((row: any) => {
      // Couchbase'den gelen bazı document'ler iç içe "students" key'i içerebilir
      // Eğer row.students varsa ve içinde login varsa, onu kullan
      // Yoksa direkt row'u student olarak kullan
      let student: any;
      
      if (row.students && typeof row.students === 'object' && row.students.login) {
        // Row'un kendisi sadece "students" key'i içeriyor, içindeki objeyi kullan
        student = { ...row.students };
      } else {
        // Row direkt student objesi veya başka bir yapı
        student = { ...row };
        // Eğer içinde nested "students" key'i varsa onu kaldır
        if (student.students && typeof student.students === 'object') {
          delete student.students;
        }
      }
      
      const login = student.login;
      const projects = projectsMap.get(login) || [];
      const stats = projectStatsMap.get(login) || { projectCount: 0, cheatCount: 0 };
      const cheatProjects = cheatProjectsMap.get(login) || [];
      const patronage = patronagesMap.get(login) || { godfathers: [], children: [], godfatherCount: 0, childrenCount: 0 };
      const locationMonths = locationStatsMap.get(login) || {};
      const feedbacks = feedbacksMap.get(login) || [];

      // Calculate logTime
      let logTime = 0;
      for (const monthKey of Object.keys(locationMonths)) {
        const monthData = locationMonths[monthKey];
        if (monthData && monthData.totalDuration) {
          const parts = monthData.totalDuration.split(':');
          logTime += parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        }
      }

      // Calculate feedback metrics
      let feedbackCount = feedbacks.length;
      let avgRating: number | undefined = undefined;
      let avgRatingDetails: any = undefined;
      let evoPerformance: number | undefined = undefined;

      if (feedbackCount > 0) {
        avgRating = feedbacks.reduce((sum: number, f: any) => sum + (f.rating || 0), 0) / feedbackCount;
        
        const nice = feedbacks.reduce((sum: number, f: any) => sum + (f.ratingDetails?.nice || 0), 0) / feedbackCount;
        const rigorous = feedbacks.reduce((sum: number, f: any) => sum + (f.ratingDetails?.rigorous || 0), 0) / feedbackCount;
        const interested = feedbacks.reduce((sum: number, f: any) => sum + (f.ratingDetails?.interested || 0), 0) / feedbackCount;
        const punctuality = feedbacks.reduce((sum: number, f: any) => sum + (f.ratingDetails?.punctuality || 0), 0) / feedbackCount;
        
        avgRatingDetails = { nice, rigorous, interested, punctuality };
        evoPerformance = (avgRating * 10) + feedbackCount;
      }

      return {
        ...student,
        projects,
        project_count: stats.projectCount,
        cheat_count: stats.cheatCount,
        has_cheats: stats.cheatCount > 0,
        cheatProjects,
        patronage: patronage.godfathers.length > 0 || patronage.children.length > 0 ? patronage : null,
        godfather_count: patronage.godfatherCount,
        children_count: patronage.childrenCount,
        logTime,
        feedbackCount,
        avgRating,
        avgRatingDetails,
        evoPerformance
      };
    });

    // Re-sort according to phase 1 order
    const loginOrderMap = new Map(loginList.map(l => [l.login, l.orderIndex]));
    students.sort((a, b) => {
      const orderA = loginOrderMap.get(a.login) ?? 999999;
      const orderB = loginOrderMap.get(b.login) ?? 999999;
      return orderA - orderB;
    });

    return res.status(200).json({
      students,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

