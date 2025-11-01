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
  blackholed: { type: Boolean, default: null },
  next_milestone: { type: String, default: null },
  is_piscine: { type: Boolean, default: false },
  is_trans: { type: Boolean, default: false }
}, { timestamps: true });

const Student = mongoose.models.Student || mongoose.model("Student", studentSchema);

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
