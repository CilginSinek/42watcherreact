import mongoose from 'mongoose';
import { getDB2Connection } from '../lib/mongodb';

const projectReviewSchema = new mongoose.Schema({
    campusId: { type: Number, required: true, index: true },
    evaluator: { type: String, required: true },
    evaluated: { type: String, required: true, index: true },
    project: { type: String, required: true },
    date: { type: String, required: true },
    score: { type: Number, default: null },
    status: { type: String, default: null },
    evaluatorComment: { type: String, default: null }
}, { timestamps: true });

// Composite index - aynı review tekrar kaydedilmesin
projectReviewSchema.index({ evaluator: 1, evaluated: 1, project: 1, date: 1 }, { unique: true });
// Additional indexes
projectReviewSchema.index({ campusId: 1, status: 1 });
projectReviewSchema.index({ evaluator: 1 });
projectReviewSchema.index({ evaluated: 1, project: 1 });

// This model uses DB2
export function getProjectReviewModel() {
    const db2 = getDB2Connection();
    return db2.models.ProjectReview || db2.model('ProjectReview', projectReviewSchema);
}

// For direct import (requires DB2 to be connected first)
export const ProjectReview = mongoose.models.ProjectReview || mongoose.model('ProjectReview', projectReviewSchema);
