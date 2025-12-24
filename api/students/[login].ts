import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';

// ============ MONGODB CONNECTION ============
const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_URL2 = process.env.MONGODB_URL2 || '';

interface CachedConnection { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null; }
interface CachedDB2 { conn: mongoose.Connection | null; }
let cached: CachedConnection = { conn: null, promise: null };
const cachedDB2: CachedDB2 = { conn: null };

async function connectDB1(): Promise<typeof mongoose> {
    if (cached.conn) return cached.conn;
    if (!cached.promise) cached.promise = mongoose.connect(MONGODB_URI);
    cached.conn = await cached.promise;
    return cached.conn;
}

async function connectDB2(): Promise<mongoose.Connection> {
    if (cachedDB2.conn && cachedDB2.conn.readyState === 1) return cachedDB2.conn;
    cachedDB2.conn = mongoose.createConnection(MONGODB_URL2);
    await new Promise<void>((resolve, reject) => { cachedDB2.conn!.once('connected', resolve); cachedDB2.conn!.once('error', reject); });
    return cachedDB2.conn;
}

async function connectDB() { await connectDB1(); await connectDB2(); return mongoose; }

// ============ MODELS ============
const studentSchema = new mongoose.Schema({
    id: { type: Number, index: true }, campusId: { type: Number, index: true },
    email: String, login: { type: String, index: true }, displayname: String,
    image: { link: String, versions: { large: String, medium: String, small: String, micro: String } },
    "staff?": Boolean, correction_point: Number, pool_month: String, pool_year: String, wallet: Number,
    "alumni?": Boolean, "active?": Boolean, blackholed: Boolean, grade: String, level: Number,
    is_piscine: Boolean, is_trans: Boolean, freeze: Boolean, sinker: Boolean, location: String
}, { timestamps: true });
const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);

const projectSchema = new mongoose.Schema({
    campusId: { type: Number, index: true }, login: { type: String, index: true },
    project: String, score: Number, date: String, status: String, penaltyDate: String
}, { timestamps: true });
const Project = mongoose.models.Project || mongoose.model('Project', projectSchema);

const locationStatsSchema = new mongoose.Schema({ campusId: Number, login: { type: String, index: true }, months: mongoose.Schema.Types.Mixed }, { timestamps: true });
const LocationStats = mongoose.models.LocationStats || mongoose.model('LocationStats', locationStatsSchema);

const feedbackSchema = new mongoose.Schema({ campusId: Number, evaluated: { type: String, index: true }, evaluator: String, rating: Number, comment: String, date: String }, { timestamps: true });
const Feedback = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);

const patronageSchema = new mongoose.Schema({ campusId: Number, login: { type: String, index: true }, godfathers: [mongoose.Schema.Types.Mixed], children: [mongoose.Schema.Types.Mixed] }, { timestamps: true });
const Patronage = mongoose.models.Patronage || mongoose.model('Patronage', patronageSchema);

const projectReviewSchema = new mongoose.Schema({ campusId: Number, project: String, evaluator: { type: String, index: true }, evaluated: { type: String, index: true }, date: String, comment: String, status: String, score: Number }, { timestamps: true });
function getProjectReviewModel() { return cachedDB2.conn!.models.ProjectReview || cachedDB2.conn!.model('ProjectReview', projectReviewSchema); }

// Session/BannedUser for auth
const sessionSchema = new mongoose.Schema({ sessionToken: { type: String, required: true, unique: true }, login: String, campusId: Number, userData: mongoose.Schema.Types.Mixed, usedIps: [String], lastActivity: Date, expiresAt: Date }, { timestamps: true });
function getSessionModel() { return cachedDB2.conn!.models.Session || cachedDB2.conn!.model('Session', sessionSchema); }
const bannedUserSchema = new mongoose.Schema({ login: { type: String, required: true, unique: true } }, { timestamps: true });
function getBannedUserModel() { return cachedDB2.conn!.models.BannedUser || cachedDB2.conn!.model('BannedUser', bannedUserSchema); }

// ============ AUTH & HELPERS ============
interface AuthReq extends VercelRequest { user?: Record<string, unknown>; }

function setCorsHeaders(res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Content-Type', 'application/json');
}

async function authenticate(req: AuthReq, res: VercelResponse): Promise<boolean> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Authentication required' }); return false; }
    const sessionToken = authHeader.split(' ')[1];
    try {
        const Session = getSessionModel();
        const session = await Session.findOne({ sessionToken, expiresAt: { $gt: new Date() } });
        if (!session) { res.status(401).json({ error: 'Invalid or expired session' }); return false; }
        const BannedUser = getBannedUserModel();
        const banned = await BannedUser.findOne({ login: session.login });
        if (banned) { res.status(403).json({ error: 'User is banned' }); return false; }
        req.user = session.userData || {};
        return true;
    } catch { res.status(500).json({ error: 'Authentication error' }); return false; }
}

function validateLogin(login: string | undefined): string {
    if (!login) throw new Error('Invalid login');
    const loginRegex = /^[a-zA-Z0-9_-]{1,50}$/;
    if (!loginRegex.test(login)) throw new Error('Invalid login format');
    return login.trim();
}

// ============ WRAPPED SUMMARY GENERATOR ============
interface WData { student: Record<string, unknown>; projects: Record<string, unknown>[]; projectReviews: Record<string, unknown>[]; feedbacks: Record<string, unknown>[]; projectReviewsReceived: Record<string, unknown>[]; feedbacksReceived: Record<string, unknown>[]; patronage: Record<string, unknown> | null; projectReviewsForWords: Record<string, unknown>[]; feedbacksForWords: Record<string, unknown>[]; }

function generateWrappedSummary(data: WData) {
    const { student, projects = [], projectReviews = [], feedbacks = [], projectReviewsReceived = [], feedbacksReceived = [], patronage = null, projectReviewsForWords = [], feedbacksForWords = [] } = data;
    const summary: Record<string, string> = {}; const highlights: Record<string, unknown> = {}; const stats: Record<string, number> = {}; const labels: string[] = []; const fallbackNotes: string[] = [];

    const extractWords = (texts: string[]): Record<string, number> => { const wordMap: Record<string, number> = {}; texts.forEach(text => { if (!text) return; text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3).forEach(word => { wordMap[word] = (wordMap[word] || 0) + 1; }); }); return wordMap; };
    const parseProjectName = (projectName: string | undefined): { name: string; retryCount: number } => { if (!projectName) return { name: '', retryCount: 0 }; const match = projectName.match(/^(.+?)#(\d+)$/); if (match) return { name: match[1], retryCount: parseInt(match[2], 10) }; return { name: projectName, retryCount: 0 }; };

    const projectAttempts: Record<string, number> = {}; let maxRetryCount = 0; let maxRetryProject: string | null = null;
    projects.forEach((p: Record<string, unknown>) => { const { name, retryCount } = parseProjectName(p.project as string); projectAttempts[name] = (projectAttempts[name] || 0) + 1; if (retryCount > maxRetryCount) { maxRetryCount = retryCount; maxRetryProject = name; } });
    const mostAttemptedProject = Object.entries(projectAttempts).sort((a, b) => b[1] - a[1])[0];
    if (mostAttemptedProject && (mostAttemptedProject[1] > 1 || maxRetryCount > 0)) { const projectName = mostAttemptedProject ? mostAttemptedProject[0] : maxRetryProject; const attempts = mostAttemptedProject ? mostAttemptedProject[1] : 0; const retries = maxRetryProject === projectName ? maxRetryCount : 0; highlights.mostAttemptedProject = { name: projectName, attempts: Math.max(attempts, retries + 1), retries }; }

    const reviewedProjects: Record<string, number> = {}; const reviewedUsersGiven: Record<string, number> = {}; const reviewedUsersReceived: Record<string, number> = {};
    projectReviews.forEach((pr: Record<string, unknown>) => { if (pr.project) reviewedProjects[pr.project as string] = (reviewedProjects[pr.project as string] || 0) + 1; if (pr.evaluated) reviewedUsersGiven[pr.evaluated as string] = (reviewedUsersGiven[pr.evaluated as string] || 0) + 1; });
    projectReviewsReceived.forEach((pr: Record<string, unknown>) => { if (pr.evaluator) reviewedUsersReceived[pr.evaluator as string] = (reviewedUsersReceived[pr.evaluator as string] || 0) + 1; });
    const mostReviewedProject = Object.entries(reviewedProjects).sort((a, b) => b[1] - a[1])[0];
    if (mostReviewedProject) highlights.mostReviewedProject = { name: mostReviewedProject[0], count: mostReviewedProject[1] };

    const feedbackUsersGiven: Record<string, number> = {}; const feedbackUsersReceived: Record<string, number> = {};
    feedbacks.forEach((fb: Record<string, unknown>) => { if (fb.evaluated) feedbackUsersGiven[fb.evaluated as string] = (feedbackUsersGiven[fb.evaluated as string] || 0) + 1; });
    feedbacksReceived.forEach((fb: Record<string, unknown>) => { if (fb.evaluator) feedbackUsersReceived[fb.evaluator as string] = (feedbackUsersReceived[fb.evaluator as string] || 0) + 1; });

    const combinedGiven: Record<string, number> = {}; Object.entries(reviewedUsersGiven).forEach(([login, count]) => { combinedGiven[login] = (combinedGiven[login] || 0) + count; }); Object.entries(feedbackUsersGiven).forEach(([login, count]) => { combinedGiven[login] = (combinedGiven[login] || 0) + count; });
    const mostInteractedUserGiven = Object.entries(combinedGiven).sort((a, b) => b[1] - a[1])[0];
    if (mostInteractedUserGiven) highlights.mostEvaluatedUser = { login: mostInteractedUserGiven[0], totalCount: mostInteractedUserGiven[1], reviewCount: reviewedUsersGiven[mostInteractedUserGiven[0]] || 0, feedbackCount: feedbackUsersGiven[mostInteractedUserGiven[0]] || 0 };

    const combinedReceived: Record<string, number> = {}; Object.entries(reviewedUsersReceived).forEach(([login, count]) => { combinedReceived[login] = (combinedReceived[login] || 0) + count; }); Object.entries(feedbackUsersReceived).forEach(([login, count]) => { combinedReceived[login] = (combinedReceived[login] || 0) + count; });
    const mostInteractedUserReceived = Object.entries(combinedReceived).sort((a, b) => b[1] - a[1])[0];
    if (mostInteractedUserReceived) highlights.mostEvaluatorUser = { login: mostInteractedUserReceived[0], totalCount: mostInteractedUserReceived[1], reviewCount: reviewedUsersReceived[mostInteractedUserReceived[0]] || 0, feedbackCount: feedbackUsersReceived[mostInteractedUserReceived[0]] || 0 };

    const allTexts = [...projectReviewsForWords.map((pr: Record<string, unknown>) => pr.comment as string).filter(Boolean), ...feedbacksForWords.map((fb: Record<string, unknown>) => fb.comment as string).filter(Boolean)];
    const wordFrequency = extractWords(allTexts); const topWords = Object.entries(wordFrequency).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topWords.length > 0) highlights.mostUsedWords = topWords.map(([word, count]) => ({ word, count }));

    stats.totalProjects = projects.length; stats.totalReviews = projectReviews.length; stats.totalFeedbacks = feedbacks.length;
    stats.passedProjects = projects.filter((p: Record<string, unknown>) => (p.status === 'finished' || p.status === 'success') && ((p.score as number) || 0) > 0).length;
    stats.avgProjectScore = projects.length > 0 ? Math.round(projects.reduce((sum, p: Record<string, unknown>) => sum + ((p.score as number) || 0), 0) / projects.length) : 0;
    if (patronage) { stats.godfathers = ((patronage as Record<string, unknown>).godfathers as unknown[])?.length || 0; stats.children = ((patronage as Record<string, unknown>).children as unknown[])?.length || 0; }

    const hasLowActivity = stats.totalProjects < 5; const hasRepeatedAttempts = mostAttemptedProject && mostAttemptedProject[1] >= 5;
    const hasMentorRole = (stats.children || 0) > 2; const successRate = projects.length > 0 ? (stats.passedProjects / projects.length) * 100 : 0;
    if (hasRepeatedAttempts) labels.push("Vazgeçmeyen"); if (hasMentorRole) labels.push("Mentor ruhlu"); if (successRate >= 80 && projects.length >= 5) labels.push("Kendinden emin");
    if (hasLowActivity) { labels.push("Yeni başlayan"); fallbackNotes.push("Bu sene temeller atıldı"); } if (stats.totalReviews > 200) labels.push("Topluluk destekçisi");
    if (labels.length === 0) labels.push((student?.pool_year as string) === '2025' ? "Keşif aşamasında" : "Dönüş yılı"); labels.splice(4);

    const totalActivity = stats.totalProjects + stats.totalReviews; const isNewStudent = (student?.pool_year as string) === '2025';
    if (totalActivity > 200) { summary.headline = "Yoğun bir yıl geçirdin!"; summary.shortDescription = `${stats.totalProjects} proje teslim, ${stats.totalReviews} review ile dolu bir 2025.`; }
    else if (totalActivity > 110) { summary.headline = "Güzel bir ilerleme kaydedildi"; summary.shortDescription = `2025'te ${stats.totalProjects} projeye giriş yapıldı.`; }
    else if (totalActivity > 50) { summary.headline = "Başlangıçlar yapıldı"; summary.shortDescription = `İlk adımlar atıldı. ${stats.totalProjects} proje deneyimi.`; }
    else { summary.headline = isNewStudent ? "Keşif yılı" : "Ara yıl"; summary.shortDescription = isNewStudent ? "2025 yolculuğun başlangıcı oldu." : "2025'te yavaş bir tempo."; }

    return { summary, highlights, stats, labels, fallbackNotes };
}

// ============ HANDLER ============
export default async function handler(req: VercelRequest, res: VercelResponse) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        await connectDB();
        const isAuth = await authenticate(req as AuthReq, res);
        if (!isAuth) return;

        const authReq = req as AuthReq;
        const login = req.query.login as string;
        let validatedLogin: string;
        try { validatedLogin = validateLogin(login); }
        catch { return res.status(400).json({ error: 'Invalid login' }); }

        const student = await Student.findOne({ login: validatedLogin }).lean();
        if (!student) return res.status(404).json({ error: 'Student not found' });

        const studentData = student as Record<string, unknown>;

        // Handle action=wrapped
        if (req.query.action === 'wrapped') {
            const ProjectReview = getProjectReviewModel();
            const year2025Start = '2025-01-01T00:00:00.000Z'; const year2025End = '2025-12-31T23:59:59.999Z';

            const [projects, projectReviews, feedbacksData, projectReviewsReceived, feedbacksReceived, patronage, projectReviewsForWords, feedbacksForWords] = await Promise.all([
                Project.find({ login: validatedLogin, date: { $gte: year2025Start, $lte: year2025End } }).lean(),
                ProjectReview.find({ evaluator: validatedLogin, date: { $gte: year2025Start, $lte: year2025End } }).lean(),
                Feedback.find({ evaluator: validatedLogin, date: { $gte: year2025Start, $lte: year2025End } }).lean(),
                ProjectReview.find({ evaluated: validatedLogin, date: { $gte: year2025Start, $lte: year2025End } }).lean(),
                Feedback.find({ evaluated: validatedLogin, date: { $gte: year2025Start, $lte: year2025End } }).lean(),
                Patronage.findOne({ login: validatedLogin }).lean(),
                ProjectReview.find({ evaluator: validatedLogin, date: { $gte: year2025Start, $lte: year2025End }, comment: { $exists: true, $nin: [null, ''] } }, { comment: 1, _id: 0 }).lean(),
                Feedback.find({ evaluated: validatedLogin, date: { $gte: year2025Start, $lte: year2025End }, comment: { $exists: true, $nin: [null, ''] } }, { comment: 1, _id: 0 }).lean()
            ]);

            const wrappedData = generateWrappedSummary({
                student: { pool_year: studentData.pool_year as string, login: studentData.login as string, displayname: studentData.displayname as string, image: studentData.image },
                projects: projects as Record<string, unknown>[], projectReviews: projectReviews as Record<string, unknown>[], feedbacks: feedbacksData as Record<string, unknown>[],
                projectReviewsReceived: projectReviewsReceived as Record<string, unknown>[], feedbacksReceived: feedbacksReceived as Record<string, unknown>[], patronage: patronage as Record<string, unknown> | null,
                projectReviewsForWords: projectReviewsForWords as Record<string, unknown>[], feedbacksForWords: feedbacksForWords as Record<string, unknown>[]
            });

            const loginsToFetch = new Set<string>(); const highlights = wrappedData.highlights as Record<string, unknown>;
            if ((highlights?.mostEvaluatedUser as Record<string, unknown>)?.login) loginsToFetch.add((highlights.mostEvaluatedUser as Record<string, unknown>).login as string);
            if ((highlights?.mostEvaluatorUser as Record<string, unknown>)?.login) loginsToFetch.add((highlights.mostEvaluatorUser as Record<string, unknown>).login as string);

            if (loginsToFetch.size > 0) {
                const students = await Student.find({ login: { $in: Array.from(loginsToFetch) } }, { login: 1, image: 1 }).lean();
                const loginImageMap: Record<string, unknown> = {}; (students as Record<string, unknown>[]).forEach(s => { loginImageMap[s.login as string] = s.image; });
                if ((highlights?.mostEvaluatedUser as Record<string, unknown>)?.login) (highlights.mostEvaluatedUser as Record<string, unknown>).image = loginImageMap[(highlights.mostEvaluatedUser as Record<string, unknown>).login as string] || null;
                if ((highlights?.mostEvaluatorUser as Record<string, unknown>)?.login) (highlights.mostEvaluatorUser as Record<string, unknown>).image = loginImageMap[(highlights.mostEvaluatorUser as Record<string, unknown>).login as string] || null;
            }

            return res.status(200).json({ ...wrappedData, user: { login: studentData.login, displayname: studentData.displayname, image: studentData.image }, watcherUser: { login: authReq.user?.login || 'unknown', displayname: authReq.user?.displayname || 'Unknown User', image: authReq.user?.image || null } });
        }

        // DEFAULT: Student details
        const projects = await Project.find({ login: validatedLogin }).lean();
        const projectsData = (projects as Record<string, unknown>[]).map(p => ({ project: p.project, login: p.login, score: p.score, status: p.status, date: p.date, campusId: p.campusId, penaltyDate: p.penaltyDate }));

        const locationData = await LocationStats.findOne({ login: validatedLogin }).lean();
        const logTimes: Array<{ date: string; duration: number }> = [];
        const dayAttendance: Record<string, number[]> = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] };
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        interface LocDoc { months?: Record<string, { days?: Record<string, string> }>; }
        if ((locationData as LocDoc)?.months) {
            for (const [monthKey, monthData] of Object.entries((locationData as LocDoc).months!)) {
                if (monthData.days) {
                    for (const [day, durationStr] of Object.entries(monthData.days)) {
                        if (durationStr && durationStr !== '00:00:00') {
                            const parts = durationStr.split(':'); const hours = parseInt(parts[0]) || 0; const minutes = parseInt(parts[1]) || 0; const seconds = parseInt(parts[2]) || 0;
                            const totalMinutes = hours * 60 + minutes + Math.floor(seconds / 60);
                            const date = `${monthKey}-${day.padStart(2, '0')}`; logTimes.push({ date, duration: totalMinutes });
                            const fullDate = new Date(`${monthKey}-${day.padStart(2, '0')}`);
                            if (!isNaN(fullDate.getTime())) { const dayOfWeek = dayNames[fullDate.getDay()]; if (dayAttendance[dayOfWeek]) dayAttendance[dayOfWeek].push(hours + minutes / 60); }
                        }
                    }
                }
            }
        }

        const feedbacksData = await Feedback.find({ evaluated: validatedLogin }).lean();
        const feedbackCount = feedbacksData.length;
        const avgRating = feedbackCount > 0 ? (feedbacksData as Record<string, unknown>[]).reduce((sum, f) => sum + ((f.rating as number) || 0), 0) / feedbackCount : 0;
        const attendanceDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({ day, avgHours: dayAttendance[day].length > 0 ? dayAttendance[day].reduce((sum, h) => sum + h, 0) / dayAttendance[day].length : 0 }));

        const patronageData = await Patronage.findOne({ login: validatedLogin }).lean();
        const children = (patronageData as Record<string, unknown>)?.children || [];
        const godfathers = (patronageData as Record<string, unknown>)?.godfathers || [];

        res.json({
            student: { id: studentData.id, login: studentData.login, displayname: studentData.displayname, email: studentData.email, image: studentData.image, correction_point: studentData.correction_point, wallet: studentData.wallet, location: studentData.location, "active?": studentData["active?"], "alumni?": studentData["alumni?"], is_piscine: studentData.is_piscine, is_trans: studentData.is_trans, grade: studentData.grade, project_count: projects.length, projects: projectsData, patronage: { godfathers, children }, feedbackCount, avgRating: Math.round(avgRating * 100) / 100, logTimes, attendanceDays }
        });
    } catch (error) {
        console.error('Student fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch student', message: error instanceof Error ? error.message : 'Unknown error' });
    }
}
