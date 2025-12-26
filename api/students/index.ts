import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';

// ============ MONGODB CONNECTION ============
const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_URL2 = process.env.MONGODB_URL2 || '';

interface CachedConnection { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null; }
interface CachedDB2 { conn: mongoose.Connection | null; }
const cached: CachedConnection = { conn: null, promise: null };
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
    is_piscine: Boolean, is_trans: Boolean, freeze: Boolean, sinker: Boolean, is_test: Boolean
}, { timestamps: true });
const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);

const projectSchema = new mongoose.Schema({
    campusId: { type: Number, index: true }, login: { type: String, index: true },
    project: String, score: Number, date: String, status: { type: String, index: true }
}, { timestamps: true });
const Project = mongoose.models.Project || mongoose.model('Project', projectSchema);

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

// Validators
function validateCampusId(campusId: string | undefined): number | null {
    if (!campusId || campusId === 'all') return null;
    const parsed = parseInt(campusId, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 999999) throw new Error('Invalid campusId');
    return parsed;
}
function validateSearch(search: string | undefined): string {
    if (!search) return '';
    return search.replace(/[^a-zA-Z0-9\s._-]/g, '').trim().substring(0, 100);
}
function validatePool(year: string | undefined, month: string | undefined): { month: string; year: string } | null {
    if ((!month || month === '') && (!year || year === '')) return null;
    if (!month || !year) throw new Error('Both month and year required');
    const validMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const monthLower = month.toLowerCase();
    if (!validMonths.includes(monthLower) && !/^\d{1,2}$/.test(month)) throw new Error('Invalid month');
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) throw new Error('Invalid year');
    return { month: monthLower, year };
}
function validateStatus(status: string | undefined): string | null {
    if (!status || status === 'all') return null;
    const valid = ['active', 'alumni', 'staff', 'blackholed', 'transcender', 'cadet', 'piscine', 'sinker', 'freeze', 'inactive', 'test'];
    if (!valid.includes(status)) throw new Error('Invalid status');
    return status;
}
function validateSort(sort: string | undefined): string {
    const allowed = ['login', 'level', 'wallet', 'correction_point', 'project_count', 'cheat_count', 'cheat_date', 'godfather_count', 'children_count', 'log_time', 'feedback_count', 'avg_rating'];
    return (!sort || !allowed.includes(sort)) ? 'login' : sort;
}
function validateOrder(order: string | undefined): 'asc' | 'desc' { return (order === 'asc' || order === 'desc') ? order : 'asc'; }
function validateLimit(limit: string | undefined): number {
    const parsed = parseInt(String(limit), 10);
    if (isNaN(parsed) || parsed < 1) return 50;
    return parsed > 500 ? 500 : parsed;
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

        // Handle action=pools
        if (req.query.action === 'pools') {
            const filter = validatedCampusId !== null ? { campusId: validatedCampusId } : {};
            const pools = await Student.aggregate([
                { $match: filter },
                { $match: { pool_month: { $exists: true, $ne: null }, pool_year: { $exists: true, $ne: null } } },
                { $group: { _id: { month: '$pool_month', year: '$pool_year' }, count: { $sum: 1 } } },
                { $project: { _id: 0, month: '$_id.month', year: '$_id.year', count: 1 } }
            ]);
            return res.json({ pools });
        }

        // Default: Fetch students with filters
        let validatedSearch: string, validatedPool: { month: string; year: string } | null, validatedStatus: string | null;
        let validatedSort: string, validatedOrder: 'asc' | 'desc', validatedLimit: number, validatedPage: number;

        try {
            validatedSearch = validateSearch(req.query.search as string);
            validatedPool = validatePool(req.query.poolYear as string, req.query.poolMonth as string);
            validatedStatus = validateStatus(req.query.status as string);
            validatedSort = validateSort(req.query.sortBy as string);
            validatedOrder = validateOrder(req.query.order as string);
            validatedPage = parseInt(req.query.page as string, 10) || 1;
            validatedLimit = Math.min(validateLimit(req.query.limit as string), 50);
        } catch (e) { return res.status(400).json({ error: 'Bad Request', message: e instanceof Error ? e.message : 'Invalid parameters' }); }

        const skip = (validatedPage - 1) * validatedLimit;
        const sortOrder = validatedOrder === 'asc' ? 1 : -1;
        const matchStage: Record<string, unknown> = {};

        if (validatedCampusId !== null) matchStage.campusId = validatedCampusId;
        if (validatedPool) { matchStage.pool_month = validatedPool.month; matchStage.pool_year = validatedPool.year; }
        if (validatedSearch) { const searchRegex = new RegExp(validatedSearch, 'i'); matchStage.$or = [{ login: searchRegex }, { displayname: searchRegex }, { email: searchRegex }]; }

        switch (validatedStatus) {
            case "active": matchStage["active?"] = true; break;
            case "inactive": matchStage["active?"] = false; break;
            case "test": matchStage.is_test = true; break;
            case "alumni": matchStage["alumni?"] = true; break;
            case "staff": matchStage["staff?"] = true; break;
            case "blackholed": matchStage.blackholed = true; break;
            case "transcender": matchStage.grade = 'Transcender'; break;
            case "cadet": matchStage["active?"] = true; matchStage.grade = 'Cadet'; break;
            case "piscine": matchStage.is_piscine = true; break;
            case "sinker": matchStage.sinker = true; break;
            case "freeze": matchStage.freeze = true; break;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let pipeline: any[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let countPipeline: any[] = [];

        if (['login', 'level', 'wallet', 'correction_point'].includes(validatedSort)) {
            pipeline = [
                { $match: matchStage },
                { $lookup: { from: 'projects', let: { studentLogin: '$login' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$login', '$$studentLogin'] }, { $eq: ['$score', -42] }] } } }, { $limit: 1 }], as: 'cheatProjects' } },
                { $addFields: { has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] } } },
                { $project: { cheatProjects: 0 } },
                { $sort: { [validatedSort]: sortOrder } },
                { $skip: skip }, { $limit: validatedLimit }
            ];
            countPipeline = [{ $match: matchStage }, { $count: 'total' }];
        } else if (validatedSort === 'project_count') {
            pipeline = [
                { $match: matchStage },
                { $lookup: { from: 'projects', localField: 'login', foreignField: 'login', as: 'projects' } },
                { $lookup: { from: 'projects', let: { studentLogin: '$login' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$login', '$$studentLogin'] }, { $eq: ['$score', -42] }] } } }, { $limit: 1 }], as: 'cheatProjects' } },
                { $addFields: { project_count: { $size: '$projects' }, has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] } } },
                { $project: { projects: 0, cheatProjects: 0 } },
                { $sort: { project_count: sortOrder } },
                { $skip: skip }, { $limit: validatedLimit }
            ];
            countPipeline = [{ $match: matchStage }, { $count: 'total' }];
        } else if (validatedSort === 'cheat_count') {
            pipeline = [
                { $lookup: { from: 'projects', let: { studentLogin: '$login' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$login', '$$studentLogin'] }, { $eq: ['$score', -42] }] } } }], as: 'cheatProjects' } },
                { $addFields: { cheat_count: { $size: '$cheatProjects' } } },
                { $match: { ...matchStage, cheat_count: { $gt: 0 } } },
                { $addFields: { has_cheats: true } },
                { $project: { cheatProjects: 0 } },
                { $sort: { cheat_count: sortOrder } },
                { $skip: skip }, { $limit: validatedLimit }
            ];
            countPipeline = [
                { $lookup: { from: 'projects', let: { studentLogin: '$login' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$login', '$$studentLogin'] }, { $eq: ['$score', -42] }] } } }], as: 'cheatProjects' } },
                { $addFields: { cheat_count: { $size: '$cheatProjects' } } },
                { $match: { ...matchStage, cheat_count: { $gt: 0 } } },
                { $count: 'total' }
            ];
        } else if (validatedSort === 'cheat_date') {
            pipeline = [
                { $lookup: { from: 'projects', let: { studentLogin: '$login' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$login', '$$studentLogin'] }, { $eq: ['$score', -42] }] } } }, { $addFields: { effectiveDate: { $ifNull: ['$penaltyDate', '$date'] } } }, { $sort: { effectiveDate: -1 } }, { $limit: 1 }], as: 'cheatProjects' } },
                { $addFields: { cheat_date: { $arrayElemAt: ['$cheatProjects.effectiveDate', 0] }, has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] } } },
                { $match: { ...matchStage, cheat_date: { $ne: null } } },
                { $project: { cheatProjects: 0 } },
                { $sort: { cheat_date: sortOrder } },
                { $skip: skip }, { $limit: validatedLimit }
            ];
            countPipeline = [
                { $lookup: { from: 'projects', let: { studentLogin: '$login' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$login', '$$studentLogin'] }, { $eq: ['$score', -42] }] } } }, { $addFields: { effectiveDate: { $ifNull: ['$penaltyDate', '$date'] } } }], as: 'cheatProjects' } },
                { $addFields: { cheat_date: { $arrayElemAt: ['$cheatProjects.effectiveDate', 0] } } },
                { $match: { ...matchStage, cheat_date: { $ne: null } } },
                { $count: 'total' }
            ];
        } else if (validatedSort === 'godfather_count' || validatedSort === 'children_count') {
            pipeline = [
                { $match: matchStage },
                { $lookup: { from: 'patronages', localField: 'login', foreignField: 'login', as: 'patronage' } },
                { $lookup: { from: 'projects', let: { studentLogin: '$login' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$login', '$$studentLogin'] }, { $eq: ['$score', -42] }] } } }, { $limit: 1 }], as: 'cheatProjects' } },
                { $addFields: { godfather_count: { $size: { $ifNull: [{ $arrayElemAt: ['$patronage.godfathers', 0] }, []] } }, children_count: { $size: { $ifNull: [{ $arrayElemAt: ['$patronage.children', 0] }, []] } }, has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] } } },
                { $project: { patronage: 0, cheatProjects: 0 } },
                { $sort: { [validatedSort]: sortOrder } },
                { $skip: skip }, { $limit: validatedLimit }
            ];
            countPipeline = [{ $match: matchStage }, { $count: 'total' }];
        } else if (validatedSort === 'log_time') {
            pipeline = [
                { $match: matchStage },
                { $lookup: { from: 'locationstats', localField: 'login', foreignField: 'login', as: 'locationData' } },
                { $lookup: { from: 'projects', let: { studentLogin: '$login' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$login', '$$studentLogin'] }, { $eq: ['$score', -42] }] } } }, { $limit: 1 }], as: 'cheatProjects' } },
                { $addFields: { log_time: { $reduce: { input: { $objectToArray: { $ifNull: [{ $arrayElemAt: ['$locationData.months', 0] }, {}] } }, initialValue: 0, in: { $add: ['$$value', { $reduce: { input: { $objectToArray: { $ifNull: ['$$this.v.days', {}] } }, initialValue: 0, in: { $let: { vars: { parts: { $split: ['$$this.v', ':'] }, hours: { $toInt: { $arrayElemAt: [{ $split: ['$$this.v', ':'] }, 0] } }, minutes: { $toInt: { $arrayElemAt: [{ $split: ['$$this.v', ':'] }, 1] } }, seconds: { $toInt: { $arrayElemAt: [{ $split: ['$$this.v', ':'] }, 2] } } }, in: { $add: ['$$value', { $multiply: ['$$hours', 3600] }, { $multiply: ['$$minutes', 60] }, '$$seconds'] } } } } }] } } }, has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] } } },
                { $project: { locationData: 0, cheatProjects: 0 } },
                { $sort: { log_time: sortOrder } },
                { $skip: skip }, { $limit: validatedLimit }
            ];
            countPipeline = [{ $match: matchStage }, { $count: 'total' }];
        } else if (validatedSort === 'feedback_count') {
            pipeline = [
                { $match: matchStage },
                { $lookup: { from: 'feedbacks', localField: 'login', foreignField: 'evaluated', as: 'feedbacks' } },
                { $lookup: { from: 'projects', let: { studentLogin: '$login' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$login', '$$studentLogin'] }, { $eq: ['$score', -42] }] } } }, { $limit: 1 }], as: 'cheatProjects' } },
                { $addFields: { feedback_count: { $size: '$feedbacks' }, has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] } } },
                { $project: { feedbacks: 0, cheatProjects: 0 } },
                { $sort: { feedback_count: sortOrder } },
                { $skip: skip }, { $limit: validatedLimit }
            ];
            countPipeline = [{ $match: matchStage }, { $count: 'total' }];
        } else if (validatedSort === 'avg_rating') {
            pipeline = [
                { $match: matchStage },
                { $lookup: { from: 'feedbacks', let: { studentLogin: '$login' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$evaluated', '$$studentLogin'] }, { $ne: ['$rating', null] }] } } }], as: 'feedbacks' } },
                { $lookup: { from: 'projects', let: { studentLogin: '$login' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$login', '$$studentLogin'] }, { $eq: ['$score', -42] }] } } }, { $limit: 1 }], as: 'cheatProjects' } },
                { $addFields: { avg_rating: { $avg: '$feedbacks.rating' }, has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] } } },
                { $project: { feedbacks: 0, cheatProjects: 0 } },
                { $sort: { avg_rating: sortOrder } },
                { $skip: skip }, { $limit: validatedLimit }
            ];
            countPipeline = [{ $match: matchStage }, { $count: 'total' }];
        } else {
            pipeline = [{ $match: matchStage }, { $sort: { login: sortOrder } }, { $skip: skip }, { $limit: validatedLimit }];
            countPipeline = [{ $match: matchStage }, { $count: 'total' }];
        }

        const [students, countResult] = await Promise.all([Student.aggregate(pipeline), Student.aggregate(countPipeline)]);
        const total = countResult.length > 0 ? countResult[0].total : 0;
        const totalPages = Math.ceil(total / validatedLimit);

        res.json({ students, pagination: { total, page: validatedPage, limit: validatedLimit, totalPages } });
    } catch (error) {
        console.error('Students list error:', error);
        res.status(500).json({ error: 'Failed to fetch students', message: error instanceof Error ? error.message : 'Unknown error' });
    }
}
