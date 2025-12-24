import mongoose from 'mongoose';
import { getDB2Connection } from '../lib/mongodb';

const eventlogSchema = new mongoose.Schema({
    login: { type: String, required: true, index: true },
    campusId: { type: Number, required: true, index: true },
    eventType: { type: String, required: true },
    eventData: { type: mongoose.Schema.Types.Mixed },
    // Request details
    ip: { type: String },
    userAgent: { type: String },
    method: { type: String },
    path: { type: String },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

eventlogSchema.index({ login: 1, eventType: 1, timestamp: -1 });
eventlogSchema.index({ campusId: 1, eventType: 1, timestamp: -1 });

// This model uses DB2
export function getEventLogModel() {
    const db2 = getDB2Connection();
    return db2.models.EventLog || db2.model('EventLog', eventlogSchema);
}

export const EventLog = mongoose.models.EventLog || mongoose.model('EventLog', eventlogSchema);
