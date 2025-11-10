import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { Student, Project, Patronage } from '../models/Student.js';

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define MONGODB_URI environment variable');
}

interface CachedConnection {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: CachedConnection | undefined;
}

const cached: CachedConnection = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI!, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

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

  // Authorization kontrolü
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

  try {
    await connectDB();

    // Query parametreleri
    const { 
      search, 
      status, // 'all', 'active', 'blackhole', 'piscine', 'transfer', 'alumni', 'cheaters'
      campusId, // '49' (Istanbul), '50' (Kocaeli)
      sortBy = 'login', // 'login', 'correction_point', 'wallet', 'created_at'
      order = 'asc', // 'asc', 'desc'
      limit = '100',
      page = '1'
    } = req.query;

    // Filter oluştur
    const filter: Record<string, unknown> = {};

    // Campus filter
    if (campusId && typeof campusId === 'string') {
      filter.campusId = parseInt(campusId);
    }

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
        case 'sinker':
          filter.sinker = true;
          break;
        case 'freeze':
          filter.freeze = true;
          break;
        case 'cheaters': {
          // Cheaters filter: Students with projects having score -42
          const cheaterLogins = await Project.distinct('login', { score: -42 });
          filter.login = { $in: cheaterLogins };
          break;
        }
      }
    }

    // Sorting
    const sortOrder = order === 'desc' ? -1 : 1;
    const sort: { [key: string]: 1 | -1 } = {};
    const isCheatCountSort = sortBy === 'cheat_count';
    
    if (typeof sortBy === 'string' && !isCheatCountSort) {
      sort[sortBy] = sortOrder as 1 | -1;
    }

    // Pagination
    const limitNum = parseInt(limit as string) || 100;
    const pageNum = parseInt(page as string) || 1;
    const skip = (pageNum - 1) * limitNum;

    // Fetch students (without pagination if sorting by cheat_count)
    const [students, total] = await Promise.all([
      Student.find(filter)
        .sort(isCheatCountSort ? {} : sort)
        .limit(isCheatCountSort ? 0 : limitNum)
        .skip(isCheatCountSort ? 0 : skip)
        .select('-__v')
        .lean(),
      Student.countDocuments(filter)
    ]);

    // Fetch projects for all students in one query
    const studentLogins = students.map((s: Record<string, unknown>) => s.login as string);
    const projects = await Project.find({ login: { $in: studentLogins } })
      .select('-__v')
      .lean();

    // Fetch patronage data for all students
    const patronages = await Patronage.find({ login: { $in: studentLogins } })
      .select('-__v')
      .lean();

    // Group projects by login
    const projectsByLogin = projects.reduce((acc: Record<string, Record<string, unknown>[]>, project: Record<string, unknown>) => {
      const login = project.login as string;
      if (!acc[login]) {
        acc[login] = [];
      }
      acc[login].push(project);
      return acc;
    }, {});

    // Group patronages by login
    const patronageByLogin = patronages.reduce((acc: Record<string, Record<string, unknown>>, patronage: Record<string, unknown>) => {
      const login = patronage.login as string;
      acc[login] = patronage;
      return acc;
    }, {});

    // Add projects and patronage to each student
    let studentsWithData = students.map((student: Record<string, unknown>) => {
      const studentProjects = projectsByLogin[student.login as string] || [];
      const hasCheats = studentProjects.some((p: Record<string, unknown>) => p.score === -42);
      
      return {
        ...student,
        projects: studentProjects,
        project_count: studentProjects.length,
        has_cheats: hasCheats,
        cheat_count: studentProjects.filter((p: Record<string, unknown>) => p.score === -42).length,
        patronage: patronageByLogin[student.login as string] || null
      };
    });

    // Sort by cheat count if needed
    if (isCheatCountSort) {
      studentsWithData.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const aCount = a.cheat_count as number;
        const bCount = b.cheat_count as number;
        return sortOrder === 1 ? aCount - bCount : bCount - aCount;
      });
      // Apply pagination after sorting
      studentsWithData = studentsWithData.slice(skip, skip + limitNum);
    }

    return res.status(200).json({
      students: studentsWithData,
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
