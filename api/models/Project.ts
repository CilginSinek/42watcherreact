import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
    campusId: { type: Number, required: true, index: true },
    login: { type: String, required: true, index: true },
    project: { type: String, required: true },
    score: { type: Number, required: true },
    date: { type: String, required: true },
    penaltyDate: { type: String, default: null },
    status: {
        type: String,
        enum: ['success', 'fail', 'in_progress'],
        required: true,
        index: true
    }
}, { timestamps: true });

// Composite index - aynı kişi aynı projede tekrar çekmesin
projectSchema.index({ login: 1, project: 1 }, { unique: true });
// Additional indexes for common queries
projectSchema.index({ campusId: 1, status: 1 });
projectSchema.index({ login: 1, status: 1 });

export const Project = mongoose.models.Project || mongoose.model('Project', projectSchema);
