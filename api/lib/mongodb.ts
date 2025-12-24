import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_URL2 = process.env.MONGODB_URL2 || '';

if (!MONGODB_URI) {
  throw new Error('Please define MONGODB_URI environment variable');
}

if (!MONGODB_URL2) {
  throw new Error('Please define MONGODB_URL2 environment variable');
}

// Cached connections
interface CachedConnection {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

interface GlobalMongoose {
  db1: CachedConnection;
  db2: CachedConnection;
}

let cached = (global as unknown as { mongoose: GlobalMongoose }).mongoose;

if (!cached) {
  cached = (global as unknown as { mongoose: GlobalMongoose }).mongoose = {
    db1: { conn: null, promise: null },
    db2: { conn: null, promise: null }
  };
}

// DB1 Connection (Primary - Students, Projects, LocationStats, etc.)
async function connectDB1(): Promise<typeof mongoose> {
  if (cached.db1.conn) {
    return cached.db1.conn;
  }

  if (!cached.db1.promise) {
    cached.db1.promise = mongoose.connect(MONGODB_URI).then((mongoose) => {
      return mongoose;
    });
  }

  cached.db1.conn = await cached.db1.promise;
  return cached.db1.conn;
}

// DB2 Connection (Secondary - ProjectReviews, EventLogs, Sessions, BannedUsers)
let db2Connection: mongoose.Connection | null = null;

async function connectDB2(): Promise<mongoose.Connection> {
  if (db2Connection && db2Connection.readyState === 1) {
    return db2Connection;
  }

  db2Connection = mongoose.createConnection(MONGODB_URL2);

  await new Promise<void>((resolve, reject) => {
    db2Connection!.once('connected', resolve);
    db2Connection!.once('error', reject);
  });

  return db2Connection;
}

// Connect to both databases
async function connectDB(): Promise<typeof mongoose> {
  await connectDB1();
  await connectDB2();
  return mongoose;
}

// Get DB2 connection for models
function getDB2Connection(): mongoose.Connection {
  if (!db2Connection) {
    throw new Error('DB2 not connected. Call connectDB() first.');
  }
  return db2Connection;
}

export { connectDB, connectDB1, connectDB2, getDB2Connection };
export default connectDB;
