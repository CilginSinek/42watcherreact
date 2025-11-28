import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/couchbase';

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
  }

  try {
    const { cluster } = await connectToDatabase();

    // Get distinct pool combinations from students
    const query = `
      SELECT DISTINCT pool_month, pool_year, COUNT(*) as count
      FROM students
      WHERE pool_month IS NOT NULL AND pool_year IS NOT NULL
      GROUP BY pool_month, pool_year
      ORDER BY pool_year DESC, pool_month DESC
    `;

    const result = await cluster.query(query);
    const pools = result.rows.map((row: { pool_month: string; pool_year: string; count: number }) => ({
      month: row.pool_month,
      year: row.pool_year,
      count: row.count
    }));

    return NextResponse.json({ pools });

  } catch (error) {
    console.error('Error fetching pools:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
