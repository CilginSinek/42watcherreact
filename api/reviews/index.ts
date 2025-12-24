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
    login: { type: String, index: true }, displayname: String,
    image: { link: String, versions: { large: String, medium: String, small: String, micro: String } }
}, { timestamps: true });
const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);

const projectReviewSchema = new mongoose.Schema({
    campusId: { type: Number, index: true }, project: String, evaluator: { type: String, index: true },
    evaluated: { type: String, index: true }, date: String, status: String, score: Number, comment: String,
    evaluatorComment: String
}, { timestamps: true });

function getProjectReviewModel() {
    return cachedDB2.conn!.models.ProjectReview || cachedDB2.conn!.model('ProjectReview', projectReviewSchema);
}

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

        const ProjectReview = getProjectReviewModel();

        // Handle action=statuses
        if (req.query.action === 'statuses') {
            const statuses = await ProjectReview.distinct('status');
            const validStatuses = statuses.filter((s: unknown) => s !== null && s !== undefined);
            return res.json({ statuses: validStatuses.sort() });
        }

        // Handle action=projectNames
        if (req.query.action === 'projectNames') {
            const projectNames = await ProjectReview.distinct('project');
            return res.json({ projectNames: projectNames.sort() });
        }

        // Default: Fetch reviews with filters
        let validatedCampusId: number | null = null;
        try { validatedCampusId = validateCampusId(req.query.campusId as string); }
        catch { return res.status(400).json({ error: 'Invalid campus ID' }); }

        const page = parseInt(req.query.page as string, 10);
        const limit = parseInt(req.query.limit as string, 10);
        const validatedPage = (!isNaN(page) && page > 0) ? page : 1;
        const validatedLimit = (!isNaN(limit) && limit > 0 && limit <= 100) ? limit : 50;
        const skip = (validatedPage - 1) * validatedLimit;

        const filter: Record<string, unknown> = {};
        if (validatedCampusId !== null) filter.campusId = validatedCampusId;

        if (req.query.projectName && typeof req.query.projectName === 'string') {
            const sanitizedProject = req.query.projectName.replace(/[^a-zA-Z0-9\s._-]/g, '').substring(0, 100);
            if (sanitizedProject) filter.project = sanitizedProject;
        }

        if (req.query.evaluatorLogin && typeof req.query.evaluatorLogin === 'string') {
            const sanitized = req.query.evaluatorLogin.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
            if (sanitized) filter.evaluator = new RegExp(sanitized, 'i');
        }

        if (req.query.evaluatedLogin && typeof req.query.evaluatedLogin === 'string') {
            const sanitized = req.query.evaluatedLogin.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
            if (sanitized) filter.evaluated = new RegExp(sanitized, 'i');
        }

        if (req.query.status && typeof req.query.status === 'string') {
            const sanitized = req.query.status.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
            if (sanitized) filter.status = sanitized;
        }

        if (req.query.score) {
            const score = parseInt(req.query.score as string, 10);
            if (!isNaN(score) && score >= -42 && score <= 125) filter.score = score;
        }

        if (req.query.search && typeof req.query.search === 'string') {
            const sanitized = req.query.search.replace(/[^a-zA-Z0-9\s._-]/g, '').trim().substring(0, 200);
            if (sanitized) filter.evaluatorComment = new RegExp(sanitized, 'i');
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (req.query.dateFilter && typeof req.query.dateFilter === 'string') {
            const dateFrom = req.query.dateFrom as string;
            if (dateFrom && dateRegex.test(dateFrom)) {
                switch (req.query.dateFilter) {
                    case 'after': filter.date = { $gte: dateFrom }; break;
                    case 'before': filter.date = { $lte: dateFrom }; break;
                    case 'between':
                        const dateTo = req.query.dateTo as string;
                        if (dateTo && dateRegex.test(dateTo)) filter.date = { $gte: dateFrom, $lte: dateTo };
                        break;
                }
            }
        }

        const [reviews, total] = await Promise.all([
            ProjectReview.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(validatedLimit).lean(),
            ProjectReview.countDocuments(filter)
        ]);

        const enrichedReviews = await Promise.all(
            reviews.map(async (review: Record<string, unknown>) => {
                const [evaluatorData, evaluatedData] = await Promise.all([
                    Student.findOne({ login: review.evaluator }).select('id login displayname image').lean(),
                    Student.findOne({ login: review.evaluated }).select('id login displayname image').lean()
                ]);
                return {
                    ...review,
                    evaluatorData: evaluatorData ? { id: (evaluatorData as Record<string, unknown>).id, login: (evaluatorData as Record<string, unknown>).login, displayname: (evaluatorData as Record<string, unknown>).displayname, image: (evaluatorData as Record<string, unknown>).image } : null,
                    evaluatedData: evaluatedData ? { id: (evaluatedData as Record<string, unknown>).id, login: (evaluatedData as Record<string, unknown>).login, displayname: (evaluatedData as Record<string, unknown>).displayname, image: (evaluatedData as Record<string, unknown>).image } : null
                };
            })
        );

        const totalPages = Math.ceil(total / validatedLimit);
        res.json({ reviews: enrichedReviews, pagination: { total, page: validatedPage, limit: validatedLimit, totalPages } });
    } catch (error) {
        console.error('Reviews fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch reviews', message: error instanceof Error ? error.message : 'Unknown error' });
    }
}
