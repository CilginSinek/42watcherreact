import mongoose from 'mongoose';
import { getDB2Connection } from '../lib/mongodb';

const sessionSchema = new mongoose.Schema({
  sessionToken: { type: String, required: true, unique: true, index: true },
  login: { type: String, required: true, index: true },
  campusId: { type: Number, required: true },
  userData: { type: mongoose.Schema.Types.Mixed }, // Full user data from 42 API
  usedIps: [{ type: String }], // Array of IPs this session was used from
  lastActivity: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: true }
}, { timestamps: true });

// Index for automatic cleanup
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Index for user sessions by last activity
sessionSchema.index({ login: 1, lastActivity: -1 });

// This model uses DB2
export function getSessionModel() {
  const db2 = getDB2Connection();
  return db2.models.Session || db2.model('Session', sessionSchema);
}

// For backwards compatibility - will use default mongoose connection
export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
