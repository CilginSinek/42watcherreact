import mongoose from 'mongoose';
import { getDB2Connection } from '../lib/mongodb';

const bannedUserSchema = new mongoose.Schema({
    login: { type: String, required: true, unique: true, index: true },
    campusId: { type: Number, required: true },
    reason: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null }
}, { timestamps: true });

// This model uses DB2
export function getBannedUserModel() {
    const db2 = getDB2Connection();
    return db2.models.BannedUser || db2.model('BannedUser', bannedUserSchema);
}

export const BannedUser = mongoose.models.BannedUser || mongoose.model('BannedUser', bannedUserSchema);
