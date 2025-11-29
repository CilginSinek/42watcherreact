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

  try {
    const studentsKeyspace = getKeyspace('students');

    // Get unique pool_month and pool_year combinations using N1QL
    const query = `
      SELECT 
        pool_month AS month,
        pool_year AS year,
        COUNT(*) AS count
      FROM ${studentsKeyspace}
      WHERE pool_month IS NOT NULL 
        AND pool_month != ""
        AND pool_year IS NOT NULL 
        AND pool_year != ""
      GROUP BY pool_month, pool_year
      ORDER BY pool_year DESC, pool_month DESC
    `;

    const result = await executeQuery(query);
    const pools = result.rows.map((row: any) => ({
      month: row.month,
      year: row.year,
      count: row.count
    }));

    return res.status(200).json({ pools });
  } catch (error) {
    console.error('Error fetching pools:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
