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

export async function GET(
  request: NextRequest,
  { params }: { params: { login: string } }
) {
  const { login } = params;

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

  if (!login || typeof login !== 'string') {
    return NextResponse.json(
      { error: 'Login parameter is required' },
      { status: 400 }
    );
  }

  try {
    const { cluster } = await connectToDatabase();

    // Get student basic info
    const studentQuery = `
      SELECT * FROM students
      WHERE LOWER(login) = LOWER($login)
      LIMIT 1
    `;
    
    const studentResult = await cluster.query(studentQuery, {
      parameters: { login }
    });

    if (!studentResult.rows || studentResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Student not found', login },
        { status: 404 }
      );
    }

    const student = studentResult.rows[0];

    // Get all projects for this student
    const projectsQuery = `
      SELECT project, score, date, status
      FROM projects
      WHERE login = $login
      ORDER BY date DESC
    `;
    
    const projectsResult = await cluster.query(projectsQuery, {
      parameters: { login }
    });
    const projects = projectsResult.rows || [];

    // Get feedback count and average rating
    const feedbackQuery = `
      SELECT 
        COUNT(*) as feedbackCount,
        AVG(rating) as avgRating
      FROM feedbacks
      WHERE login = $login
    `;
    
    const feedbackResult = await cluster.query(feedbackQuery, {
      parameters: { login }
    });
    
    const feedbackData = feedbackResult.rows[0] || { feedbackCount: 0, avgRating: 0 };

    // Get location stats (last 90 days)
    const locationQuery = `
      SELECT months FROM locationstats
      WHERE login = $login
      LIMIT 1
    `;
    
    const locationResult = await cluster.query(locationQuery, {
      parameters: { login }
    });

    const logTimes: Array<{ date: string; duration: number }> = [];
    const attendanceDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => ({
      day,
      avgHours: 0
    }));

    // Process location data if available
    if (locationResult.rows && locationResult.rows.length > 0) {
      const locationData = locationResult.rows[0];
      // Process months data here if needed
      // This would require converting the Map structure from MongoDB to Couchbase format
    }

    // Calculate metrics
    const project_count = projects.length;
    const evoPerformance = feedbackData.avgRating 
      ? Math.round((feedbackData.avgRating * 10) + feedbackData.feedbackCount)
      : null;

    const studentData = {
      ...student,
      projects,
      project_count,
      feedbackCount: feedbackData.feedbackCount,
      avgRating: feedbackData.avgRating,
      evoPerformance,
      logTimes,
      attendanceDays
    };

    return NextResponse.json({ student: studentData });

  } catch (error) {
    console.error('Error fetching student details:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
