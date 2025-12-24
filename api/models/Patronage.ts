import mongoose from 'mongoose';

const patronageSchema = new mongoose.Schema({
    login: { type: String, required: true, unique: true, index: true },
    campusId: { type: Number, required: true, index: true },
    // Godfathers (patroned by) - Bu kişinin mentorları
    godfathers: [{
        login: { type: String, required: true }
    }],
    // Children (patroning) - Bu kişinin mentee'leri
    children: [{
        login: { type: String, required: true }
    }],
    lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

export const Patronage = mongoose.models.Patronage || mongoose.model('Patronage', patronageSchema);
