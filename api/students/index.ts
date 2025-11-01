import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';

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

// Student Schema
const studentSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true },
  campusId: { type: Number, required: true, index: true },
  email: String,
  login: { type: String, required: true, unique: true, index: true },
  first_name: String,
  last_name: String,
  usual_full_name: String,
  usual_first_name: String,
  url: String,
  phone: String,
  displayname: String,
  kind: String,
  image: {
    link: String,
    versions: {
      large: String,
      medium: String,
      small: String,
      micro: String
    }
  },
  "staff?": Boolean,
  correction_point: Number,
  pool_month: String,
  pool_year: String,
  location: String,
  wallet: Number,
  anonymize_date: String,
  data_erasure_date: String,
  created_at: Date,
  updated_at: Date,
  alumnized_at: Date,
  "alumni?": Boolean,
  "active?": Boolean,
  // Milestone bilgileri
  blackholed: { type: Boolean, default: null },
  next_milestone: { type: String, default: null },
  // Piscine durumu (pool_month/pool_year şu an veya gelecekteyse true)
  is_piscine: { type: Boolean, default: false },
  // Transfer öğrenci durumu (alumni olursa false)
  is_trans: { type: Boolean, default: false },
  // Freeze durumu (inactive + agu var)
  freeze: { type: Boolean, default: null },
  // Sinker durumu (inactive + agu yok)
  sinker: { type: Boolean, default: null }
}, { timestamps: true });

const Student = mongoose.models.Student || mongoose.model("Student", studentSchema);

// Cheater Schema
const cheaterSchema = new mongoose.Schema({
  campusId: { type: Number, required: true, index: true },
  login: { type: String, required: true, index: true },
  project: { type: String, required: true },
  score: { type: Number, required: true },
  date: { type: String, required: true }
}, { timestamps: true });

cheaterSchema.index({ login: 1, project: 1, date: 1 }, { unique: true });

const Cheater = mongoose.models.Cheater || mongoose.model("Cheater", cheaterSchema);

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
          // Cheaters filter: Get distinct logins from Cheater collection
          const cheaterLogins = await Cheater.distinct('login');
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

    // Fetch cheats for all students in one query
    const studentLogins = students.map((s: any) => s.login);
    const cheats = await Cheater.find({ login: { $in: studentLogins } })
      .select('-__v')
      .lean();

    // Group cheats by login
    const cheatsByLogin = cheats.reduce((acc: Record<string, any[]>, cheat: any) => {
      if (!acc[cheat.login]) {
        acc[cheat.login] = [];
      }
      acc[cheat.login].push(cheat);
      return acc;
    }, {});

    // Add cheats to each student
    let studentsWithCheats = students.map((student: any) => ({
      ...student,
      cheats: cheatsByLogin[student.login] || [],
      cheat_count: (cheatsByLogin[student.login] || []).length
    }));

    // Sort by cheat count if needed
    if (isCheatCountSort) {
      studentsWithCheats.sort((a: any, b: any) => {
        return sortOrder === 1 ? a.cheat_count - b.cheat_count : b.cheat_count - a.cheat_count;
      });
      // Apply pagination after sorting
      studentsWithCheats = studentsWithCheats.slice(skip, skip + limitNum);
    }

    return res.status(200).json({
      students: studentsWithCheats,
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
