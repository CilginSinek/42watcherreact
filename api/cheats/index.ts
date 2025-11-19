import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { Project } from '../models/Student.js';

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
    await connectDB();

    const { login } = req.query;

    if (!login || typeof login !== 'string') {
      return res.status(400).json({ error: 'Login parameter is required' });
    }

    // Basic validation: allow only reasonable login characters to avoid injection
    const safeLogin = /^[a-z0-9._-]{1,50}$/i.test(login) ? login : null;
    if (!safeLogin) {
      return res.status(400).json({ error: 'Invalid login parameter' });
    }

    // Fetch all projects for this student
    const projects = await Project.find({ login: safeLogin })
      .sort({ date: -1 })
      .select('-_id -__v -campusId -createdAt -updatedAt')
      .lean();

    // Separate cheats (score -42) and regular projects
    const cheats = projects.filter((p: Record<string, unknown>) => p.score === -42);
    const regularProjects = projects.filter((p: Record<string, unknown>) => p.score !== -42);

    return res.status(200).json({
      login,
      projects: regularProjects,
      cheats,
      totalProjects: projects.length,
      cheatCount: cheats.length
    });
  } catch (error) {
    console.error('Error fetching cheats:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
