import type { VercelRequest, VercelResponse } from '@vercel/node';
import connectDB from '../lib/mongodb.js';
import { Student } from '../models/Student.js';

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
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();

    // Query parametreleri
    const { 
      search, 
      status, // 'all', 'active', 'blackhole', 'piscine', 'transfer', 'alumni'
      sortBy = 'login', // 'login', 'correction_point', 'wallet', 'created_at'
      order = 'asc', // 'asc', 'desc'
      limit = '100',
      page = '1'
    } = req.query;

    // Filter oluştur
    const filter: Record<string, unknown> = {};

    // Search filter (login, displayname, email)
    if (search && typeof search === 'string') {
      filter.$or = [
        { login: { $regex: search, $options: 'i' } },
        { displayname: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status && typeof status === 'string') {
      switch (status) {
        case 'active':
          filter['active?'] = true;
          filter['alumni?'] = { $ne: true };
          filter.blackholed = { $ne: true };
          filter.is_piscine = false;
          break;
        case 'blackhole':
          filter.blackholed = true;
          break;
        case 'piscine':
          filter.is_piscine = true;
          break;
        case 'transfer':
          filter.is_trans = true;
          break;
        case 'alumni':
          filter['alumni?'] = true;
          break;
      }
    }

    // Sorting
    const sortOrder = order === 'desc' ? -1 : 1;
    const sort: { [key: string]: 1 | -1 } = {};
    if (typeof sortBy === 'string') {
      sort[sortBy] = sortOrder as 1 | -1;
    }

    // Pagination
    const limitNum = parseInt(limit as string) || 100;
    const pageNum = parseInt(page as string) || 1;
    const skip = (pageNum - 1) * limitNum;

    // Fetch students
    const [students, total] = await Promise.all([
      Student.find(filter)
        .sort(sort)
        .limit(limitNum)
        .skip(skip)
        .select('-__v')
        .lean(),
      Student.countDocuments(filter)
    ]);

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
