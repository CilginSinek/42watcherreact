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
    id: { type: Number, required: true, unique: true, index: true },
    campusId: { type: Number, required: true, index: true },
    email: String, login: { type: String, required: true, unique: true, index: true },
    first_name: String, last_name: String, displayname: String,
    image: { link: String, versions: { large: String, medium: String, small: String, micro: String } },
    "staff?": Boolean, correction_point: Number, pool_month: String, pool_year: String, wallet: Number,
    "alumni?": Boolean, "active?": Boolean, blackholed: Boolean, grade: String, level: Number
}, { timestamps: true });
const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);

const projectSchema = new mongoose.Schema({
    campusId: { type: Number, required: true, index: true },
    login: { type: String, required: true, index: true },
    project: { type: String, required: true }, score: { type: Number, required: true },
    date: { type: String, required: true }, status: { type: String, required: true, index: true }
}, { timestamps: true });
const Project = mongoose.models.Project || mongoose.model('Project', projectSchema);

const locationStatsSchema = new mongoose.Schema({
    campusId: { type: Number, required: true, index: true },
    login: { type: String, required: true, unique: true, index: true },
    months: mongoose.Schema.Types.Mixed
}, { timestamps: true });
const LocationStats = mongoose.models.LocationStats || mongoose.model('LocationStats', locationStatsSchema);

// Session for auth
const sessionSchema = new mongoose.Schema({
    sessionToken: { type: String, required: true, unique: true }, login: String, campusId: Number,
    userData: mongoose.Schema.Types.Mixed, usedIps: [String], lastActivity: Date, expiresAt: Date
}, { timestamps: true });
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

function validateCampusId(campusId: string | undefined): number | null {
    if (!campusId || campusId === 'all') return null;
    const parsed = parseInt(campusId, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 999999) throw new Error('Invalid campusId');
    return parsed;
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

        let validatedCampusId: number | null = null;
        try { validatedCampusId = validateCampusId(req.query.campusId as string); }
        catch { return res.status(400).json({ error: 'Invalid campus ID' }); }

        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const campusMatch = validatedCampusId !== null ? { campusId: validatedCampusId } : {};

        // Top Project Submitters
        const topProjectSubmitters = await Project.aggregate([
            { $match: { ...campusMatch, status: 'success', date: { $gte: currentMonth } } },
            { $group: { _id: '$login', projectCount: { $sum: 1 }, totalScore: { $sum: '$score' } } },
            { $lookup: { from: 'students', localField: '_id', foreignField: 'login', as: 'student' } },
            { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
            { $project: { login: '$_id', projectCount: 1, totalScore: 1, student: { id: '$student.id', login: '$student.login', displayname: '$student.displayname', image: '$student.image', correction_point: '$student.correction_point', wallet: '$student.wallet' } } },
            { $sort: { projectCount: -1 } }, { $limit: 10 }
        ]);

        // All Time Projects
        const allTimeProjects = await Project.aggregate([
            { $match: { ...campusMatch, status: 'success' } },
            { $group: { _id: '$login', projectCount: { $sum: 1 } } },
            { $lookup: { from: 'students', localField: '_id', foreignField: 'login', as: 'student' } },
            { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
            { $project: { login: '$_id', projectCount: 1, student: { id: '$student.id', login: '$student.login', displayname: '$student.displayname', image: '$student.image', correction_point: '$student.correction_point', wallet: '$student.wallet', project_count: '$projectCount' } } },
            { $sort: { projectCount: -1 } }, { $limit: 10 }
        ]);

        // All Time Wallet
        const walletStudents = await Student.find(campusMatch).select('id login displayname image correction_point wallet').sort({ wallet: -1 }).limit(10).lean();
        const allTimeWallet = walletStudents.map((s: Record<string, unknown>) => ({ login: s.login, wallet: s.wallet || 0, student: { id: s.id, login: s.login, displayname: s.displayname, image: s.image, correction_point: s.correction_point, wallet: s.wallet } }));

        // All Time Points
        const pointsStudents = await Student.find(campusMatch).select('id login displayname image correction_point wallet').sort({ correction_point: -1 }).limit(10).lean();
        const allTimePoints = pointsStudents.map((s: Record<string, unknown>) => ({ login: s.login, correctionPoint: s.correction_point || 0, student: { id: s.id, login: s.login, displayname: s.displayname, image: s.image, correction_point: s.correction_point, wallet: s.wallet } }));

        // All Time Levels
        const levelsStudents = await Student.find(campusMatch).select('id login displayname image correction_point wallet level').sort({ level: -1 }).limit(10).lean();
        const allTimeLevels = levelsStudents.map((s: Record<string, unknown>) => ({ login: s.login, level: s.level || 0, student: { id: s.id, login: s.login, displayname: s.displayname, image: s.image, correction_point: s.correction_point, wallet: s.wallet } }));

        // Grade Distribution
        const gradeDistribution = await Student.aggregate([
            { $match: { ...campusMatch, 'active?': true, 'staff?': { $ne: true }, grade: { $ne: null } } },
            { $group: { _id: '$grade', value: { $sum: 1 } } },
            { $project: { _id: 0, name: '$_id', value: 1 } }
        ]);

        // Location Stats
        const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        const allLocationStats = await LocationStats.find(campusMatch).lean();

        interface LocDoc { login?: string; months?: Record<string, { days?: Record<string, string> }>; }
        const timeByStudent: Record<string, number> = {};
        (allLocationStats as LocDoc[]).forEach(locDoc => {
            if (!locDoc.months || !locDoc.login) return;
            let totalMinutes = 0;
            for (const [monthKey, monthData] of Object.entries(locDoc.months)) {
                const monthDate = new Date(monthKey + '-01');
                if (monthDate < threeMonthsAgo) continue;
                if (monthData.days) {
                    for (const durationStr of Object.values(monthData.days)) {
                        if (!durationStr || durationStr === "00:00:00") continue;
                        const parts = durationStr.split(':');
                        totalMinutes += (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
                    }
                }
            }
            if (totalMinutes > 0) timeByStudent[locDoc.login] = (timeByStudent[locDoc.login] || 0) + totalMinutes;
        });

        const topLogins = Object.entries(timeByStudent).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([login]) => login);
        const topStudentsData = await Student.find({ login: { $in: topLogins } }).select('login displayname image correction_point wallet').lean();
        const studentMap: Record<string, Record<string, unknown>> = {};
        (topStudentsData as Record<string, unknown>[]).forEach(s => { studentMap[s.login as string] = s; });

        const topLocationStats = Object.entries(timeByStudent).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([login, totalMinutes]) => {
            const student = studentMap[login];
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            return { login, totalDuration: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`, student: student ? { login: student.login, displayname: student.displayname, image: student.image, correction_point: student.correction_point, wallet: student.wallet } : null };
        });

        // Weekly Occupancy
        const dailyActivity: Record<string, Set<string>> = { Mon: new Set(), Tue: new Set(), Wed: new Set(), Thu: new Set(), Fri: new Set(), Sat: new Set(), Sun: new Set() };
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        (allLocationStats as LocDoc[]).forEach(locDoc => {
            if (!locDoc.months || !locDoc.login) return;
            for (const [monthKey, monthData] of Object.entries(locDoc.months)) {
                const monthDate = new Date(monthKey + '-01');
                if (monthDate < threeMonthsAgo) continue;
                if (monthData.days) {
                    for (const [day, durationStr] of Object.entries(monthData.days)) {
                        if (!durationStr || durationStr === "00:00:00") continue;
                        const fullDate = new Date(`${monthKey}-${day.padStart(2, '0')}`);
                        if (!isNaN(fullDate.getTime())) {
                            const dayOfWeek = dayNames[fullDate.getDay()];
                            if (dailyActivity[dayOfWeek]) dailyActivity[dayOfWeek].add(locDoc.login!);
                        }
                    }
                }
            }
        });

        const dailyCount: Record<string, number> = { Mon: dailyActivity.Mon.size, Tue: dailyActivity.Tue.size, Wed: dailyActivity.Wed.size, Thu: dailyActivity.Thu.size, Fri: dailyActivity.Fri.size, Sat: dailyActivity.Sat.size, Sun: dailyActivity.Sun.size };
        const maxWeekly = Math.max(...Object.values(dailyCount), 1);
        const weeklyOccupancy = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({ day, count: dailyCount[day], occupancy: Math.round((dailyCount[day] / maxWeekly) * 100) }));

        res.json({ currentMonth, topProjectSubmitters, topLocationStats, allTimeProjects, allTimeWallet, allTimePoints, allTimeLevels, gradeDistribution, weeklyOccupancy });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data', message: error instanceof Error ? error.message : 'Unknown error' });
    }
}
