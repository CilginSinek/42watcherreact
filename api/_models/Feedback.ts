import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
    login: { type: String, required: true }, // Feedback alan kişi (sayfanın sahibi)
    campusId: { type: Number, required: true },
    evaluator: { type: String, required: true }, // Feedback veren kişi
    evaluated: { type: String, required: true }, // Değerlendirilen kişi
    project: { type: String, required: true },
    date: { type: String, required: true },
    // Feedback puanları
    rating: { type: Number, default: null },
    // Rating detayları
    ratingDetails: {
        nice: { type: Number, default: null },
        rigorous: { type: Number, default: null },
        interested: { type: Number, default: null },
        punctuality: { type: Number, default: null }
    },
    comment: { type: String, default: null }
}, { timestamps: true });

// Composite index - aynı feedback tekrar kaydedilmesin
feedbackSchema.index({ login: 1, evaluator: 1, evaluated: 1, project: 1, date: 1 }, { unique: true });
// Additional indexes
feedbackSchema.index({ campusId: 1 });
feedbackSchema.index({ login: 1, project: 1 });
feedbackSchema.index({ evaluated: 1 });

export const Feedback = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);
