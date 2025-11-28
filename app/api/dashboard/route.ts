import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/couchbase';

async function verifyToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.intra.42.fr/v2/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  // Check auth (skip for localhost)
  const host = request.headers.get('host') || '';
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

  if (!isLocalhost) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];
    const isValid = await verifyToken(token);
    
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }
  }

  try {
    const { cluster } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const campusIdParam = searchParams.get('campusId');
    
    const campusFilter = campusIdParam && campusIdParam !== 'all' 
      ? `WHERE campusId = ${parseInt(campusIdParam)}` 
      : '';

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    // Top project submitters this month
    const topProjectsQuery = `
      SELECT login, COUNT(*) as projectCount, SUM(score) as totalScore
      FROM projects
      ${campusFilter ? campusFilter + ' AND' : 'WHERE'} 
      date >= '${monthStart}' AND date <= '${monthEnd}' AND score > 0
      GROUP BY login
      ORDER BY projectCount DESC, totalScore DESC
      LIMIT 5
    `;
    
    const topProjectsResult = await cluster.query(topProjectsQuery);
    const topProjectSubmitters = topProjectsResult.rows || [];

    // All time top projects
    const allTimeProjectsQuery = `
      SELECT login, COUNT(*) as projectCount, SUM(score) as totalScore
      FROM projects
      ${campusFilter ? campusFilter + ' AND' : 'WHERE'} score > 0
      GROUP BY login
      ORDER BY projectCount DESC, totalScore DESC
      LIMIT 5
    `;
    
    const allTimeProjectsResult = await cluster.query(allTimeProjectsQuery);
    const allTimeProjects = allTimeProjectsResult.rows || [];

    // Top wallets
    const walletsQuery = `
      SELECT login, wallet
      FROM students
      ${campusFilter}
      ORDER BY wallet DESC
      LIMIT 5
    `;
    
    const walletsResult = await cluster.query(walletsQuery);
    const allTimeWallet = walletsResult.rows || [];

    // Top correction points
    const pointsQuery = `
      SELECT login, correction_point
      FROM students
      ${campusFilter}
      ORDER BY correction_point DESC
      LIMIT 5
    `;
    
    const pointsResult = await cluster.query(pointsQuery);
    const allTimePoints = pointsResult.rows || [];

    // Top levels
    const levelsQuery = `
      SELECT login, level
      FROM students
      ${campusFilter}
      ORDER BY level DESC
      LIMIT 5
    `;
    
    const levelsResult = await cluster.query(levelsQuery);
    const allTimeLevels = levelsResult.rows || [];

    // Grade distribution
    const gradeQuery = `
      SELECT grade as name, COUNT(*) as value
      FROM students
      ${campusFilter ? campusFilter + ' AND' : 'WHERE'} 
      \`active?\` = true AND grade IS NOT NULL
      GROUP BY grade
      ORDER BY grade
    `;
    
    const gradeResult = await cluster.query(gradeQuery);
    const gradeDistribution = gradeResult.rows || [];

    // Mock data for charts (would need real implementation)
    const hourlyOccupancy = Array.from({ length: 24 }, (_, i) => {
      const hour = i.toString().padStart(2, '0');
      let occupancy = 0;
      if (i >= 8 && i <= 18) {
        occupancy = Math.floor(50 + Math.random() * 40);
      } else if (i >= 19 && i <= 23) {
        occupancy = Math.floor(20 + Math.random() * 30);
      } else {
        occupancy = Math.floor(5 + Math.random() * 15);
      }
      return { hour: `${hour}:00`, occupancy };
    });

    const weeklyOccupancy = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => ({
      day,
      occupancy: Math.floor(30 + Math.random() * 70)
    }));

    return NextResponse.json({
      currentMonth,
      topProjectSubmitters: topProjectSubmitters.map(p => ({
        login: p.login,
        projectCount: p.projectCount,
        totalScore: p.totalScore,
        student: null // Would need to join with students table
      })),
      topLocationStats: [], // Would need locationstats implementation
      allTimeProjects: allTimeProjects.map(p => ({
        login: p.login,
        projectCount: p.projectCount,
        student: null
      })),
      allTimeWallet: allTimeWallet.map(s => ({
        login: s.login,
        wallet: s.wallet,
        student: null
      })),
      allTimePoints: allTimePoints.map(s => ({
        login: s.login,
        correctionPoint: s.correction_point,
        student: null
      })),
      allTimeLevels: allTimeLevels.map(s => ({
        login: s.login,
        level: s.level,
        student: null
      })),
      gradeDistribution,
      hourlyOccupancy,
      weeklyOccupancy
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
