import mongoose from 'mongoose';

const locationStatsSchema = new mongoose.Schema({
    login: { type: String, required: true, unique: true, index: true },
    campusId: { type: Number, required: true, index: true },
    // Her ay için toplam süre ve günlük detaylar
    months: {
        type: Map,
        of: {
            totalDuration: String, // "HH:MM:SS" formatında aylık toplam
            days: {
                type: Map,
                of: String // Gün -> "HH:MM:SS" formatında süre
            }
        },
        default: {}
    },
    lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

export const LocationStats = mongoose.models.LocationStats || mongoose.model('LocationStats', locationStatsSchema);
