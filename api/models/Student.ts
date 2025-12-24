import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true, index: true },
    campusId: { type: Number, required: true, index: true },
    email: String,
    login: { type: String, required: true, unique: true, index: true },
    first_name: String,
    last_name: String,
    usual_full_name: String,
    usual_first_name: String,
    url: String,
    phone: String,
    displayname: String,
    kind: String,
    image: {
        link: String,
        versions: {
            large: String,
            medium: String,
            small: String,
            micro: String
        }
    },
    "staff?": Boolean,
    correction_point: Number,
    pool_month: String,
    pool_year: String,
    wallet: Number,
    anonymize_date: String,
    data_erasure_date: String,
    created_at: Date,
    updated_at: Date,
    alumnized_at: Date,
    "alumni?": Boolean,
    "active?": Boolean,
    // Milestone bilgileri
    blackholed: { type: Boolean, default: null },
    next_milestone: { type: String, default: null },
    // Piscine durumu
    is_piscine: { type: Boolean, default: false },
    // Transfer öğrenci durumu
    is_trans: { type: Boolean, default: false },
    // Freeze durumu
    freeze: { type: Boolean, default: null },
    // Sinker durumu
    sinker: { type: Boolean, default: null },
    // Grade bilgisi
    grade: {
        type: String,
        enum: ['Cadet', 'Pisciner', 'Transcender', 'Alumni', 'Staff'],
        default: null
    },
    // Test account durumu
    is_test: { type: Boolean, default: false },
    // Level bilgisi
    level: { type: Number, default: null }
}, { timestamps: true });

// Compound indexes for common queries
studentSchema.index({ campusId: 1, 'active?': 1 });
studentSchema.index({ campusId: 1, blackholed: 1 });
studentSchema.index({ campusId: 1, grade: 1 });

export const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);
