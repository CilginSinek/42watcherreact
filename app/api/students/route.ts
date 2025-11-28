import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/couchbase';

/**
 * REQUIRED INDEXES FOR COUCHBASE (N1QL):
 * 
 * CREATE PRIMARY INDEX ON `bucket-name`.`_default`.`students`;
 * CREATE INDEX idx_students_login ON `bucket-name`.`_default`.`students`(login);
 * CREATE INDEX idx_students_campusId ON `bucket-name`.`_default`.`students`(campusId);
 * CREATE INDEX idx_students_level ON `bucket-name`.`_default`.`students`(level);
 * CREATE INDEX idx_projects_login ON `bucket-name`.`_default`.`projects`(login);
 */

function escapeN1QL(str: string): string {
  return str.replace(/'/g, "''");
}

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

    // Query parameters
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';
    const campusId = searchParams.get('campusId') || 'all';
    const poolMonth = searchParams.get('poolMonth') || '';
    const poolYear = searchParams.get('poolYear') || '';
    const sortBy = searchParams.get('sortBy') || 'login';
    const order = searchParams.get('order') || 'asc';
    const limit = parseInt(searchParams.get('limit') || '100');
    const page = parseInt(searchParams.get('page') || '1');

    const offset = (page - 1) * limit;

    // Build WHERE clause conditions
    const conditions: string[] = [];

    if (campusId !== 'all') {
      conditions.push(`campusId = ${parseInt(campusId)}`);
    }

    if (poolMonth) {
      conditions.push(`LOWER(pool_month) = '${escapeN1QL(poolMonth.toLowerCase())}'`);
    }

    if (poolYear) {
      conditions.push(`pool_year = '${escapeN1QL(poolYear)}'`);
    }

    if (search) {
      const escapedSearch = escapeN1QL(search);
      conditions.push(
        `(LOWER(login) LIKE '%${escapedSearch.toLowerCase()}%' OR ` +
        `LOWER(displayname) LIKE '%${escapedSearch.toLowerCase()}%' OR ` +
        `LOWER(email) LIKE '%${escapedSearch.toLowerCase()}%')`
      );
    }

    // Status filters
    if (status !== 'all') {
      switch (status) {
        case 'staff':
          conditions.push('`staff?` = true');
          break;
        case 'blackholed':
          conditions.push('blackholed = true');
          break;
        case 'sinker':
          conditions.push('sinker = true');
          break;
        case 'freeze':
          conditions.push('freeze = true');
          break;
        case 'transcender':
          conditions.push("grade = 'Transcender'");
          break;
        case 'cadet':
          conditions.push("grade = 'Cadet'");
          break;
        case 'piscine':
          conditions.push("grade = 'Piscine'");
          break;
        case 'alumni':
          conditions.push('`alumni?` = true');
          break;
        case 'active':
          conditions.push('`active?` = true AND `alumni?` != true');
          break;
        case 'inactive':
          conditions.push('`active?` = false AND `alumni?` != true');
          break;
        case 'test':
          conditions.push('is_test = true');
          break;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Field mapping for sorting
    const sortFieldMap: Record<string, string> = {
      'login': 'login',
      'level': 'level',
      'correction_point': 'correction_point',
      'wallet': 'wallet',
    };

    const actualSortField = sortFieldMap[sortBy] || 'login';
    const orderClause = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM students 
      ${whereClause}
    `;

    const countResult = await cluster.query(countQuery);
    const total = countResult.rows[0]?.total || 0;

    // Main query - get students
    const studentsQuery = `
      SELECT 
        id, login, displayname, email, image, 
        correction_point, wallet, level, campusId,
        \`staff?\`, \`alumni?\`, \`active?\`,
        blackholed, sinker, freeze, grade,
        pool_month, pool_year, is_test
      FROM students 
      ${whereClause}
      ORDER BY ${actualSortField} ${orderClause}
      LIMIT ${limit} OFFSET ${offset}
    `;

    const studentsResult = await cluster.query(studentsQuery);
    const students = studentsResult.rows;

    return NextResponse.json({
      students,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching students:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
