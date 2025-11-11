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
  // Piscine durumu (pool_month/pool_year şu an veya gelecekteyse true)
  is_piscine: { type: Boolean, default: false },
  // Transfer öğrenci durumu (alumni olursa false)
  is_trans: { type: Boolean, default: false },
  // Freeze durumu (inactive + agu var)
  freeze: { type: Boolean, default: null },
  // Sinker durumu (inactive + agu yok)
  sinker: { type: Boolean, default: null },
  // Grade bilgisi (HTML'den alınır)
  grade: { 
    type: String, 
    enum: ['Cadet', 'Pisciner', 'Transcender', 'Alumni', 'Staff'],
    default: null 
  },
  // Test account durumu (HTML'den alınır)
  is_test: { type: Boolean, default: false }
}, { timestamps: true });

const projectSchema = new mongoose.Schema({
  campusId: { type: Number, required: true, index: true },
  login: { type: String, required: true, index: true },
  project: { type: String, required: true },
  score: { type: Number, required: true },
  date: { type: String, required: true }
}, { timestamps: true });

// Composite index for projects - aynı kişi aynı projede tekrar çekmesin
projectSchema.index({ login: 1, project: 1, date: 1 }, { unique: true });

// Location Stats Schema - Son 3 ayın lokasyon verileri (tek kayıt per öğrenci)
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

// Patronage Schema - Godfathers (patroned by) ve Children (patroning)
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

// Feedback Schema for evaluation performance
const feedbackSchema = new mongoose.Schema({
  login: { type: String, required: true, index: true },
  evaluator: { type: String, required: true, index: true },
  project: { type: String, required: true },
  rating: { type: Number, required: true, min: 0, max: 5 },
  ratingDetails: {
    nice: { type: Number, min: 0, max: 5 },
    rigorous: { type: Number, min: 0, max: 5 },
    interested: { type: Number, min: 0, max: 5 },
    punctuality: { type: Number, min: 0, max: 5 }
  },
  comment: { type: String },
  date: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

export const Student = mongoose.models.Student || mongoose.model("Student", studentSchema);
export const Project = mongoose.models.Project || mongoose.model("Project", projectSchema);
export const LocationStats = mongoose.models.LocationStats || mongoose.model("LocationStats", locationStatsSchema);
export const Patronage = mongoose.models.Patronage || mongoose.model("Patronage", patronageSchema);
export const Feedback = mongoose.models.Feedback || mongoose.model("Feedback", feedbackSchema);

// Backward compatibility - Cheater is now Project with score -42
export const Cheater = Project;
