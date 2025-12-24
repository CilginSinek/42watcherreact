import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionModel } from '../models/Session';
import { getBannedUserModel } from '../models/BannedUser';

export interface AuthenticatedRequest extends VercelRequest {
    user?: Record<string, unknown>;
    session?: {
        token: string;
        login: string;
        campusId: number;
    };
}

/**
 * Middleware to verify session-based authentication
 * Returns user data if authenticated, null otherwise
 */
export async function authenticate(
    req: AuthenticatedRequest,
    res: VercelResponse
): Promise<boolean> {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'No Bearer token provided'
            });
            return false;
        }

        const sessionToken = authHeader.substring(7);

        // Get Session model from DB2
        const Session = getSessionModel();

        // Find session in database
        const session = await Session.findOne({
            sessionToken,
            expiresAt: { $gt: new Date() }
        });

        if (!session) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or expired session'
            });
            return false;
        }

        // Check if user is banned
        const BannedUser = getBannedUserModel();
        const bannedRecord = await BannedUser.findOne({
            login: session.login,
            $or: [
                { expiresAt: null },
                { expiresAt: { $gt: new Date() } }
            ]
        });

        if (bannedRecord) {
            await Session.deleteOne({ sessionToken });
            res.status(403).json({
                error: 'Forbidden',
                message: `User is banned${bannedRecord.reason ? `: ${bannedRecord.reason}` : ''}`
            });
            return false;
        }

        // Get client IP
        const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            || (req.headers['x-real-ip'] as string)
            || 'unknown';

        // Update last_activity and track IP
        const updates: Record<string, unknown> = {
            lastActivity: new Date()
        };

        // Add IP to usedIps if not already present
        if (clientIp && !session.usedIps.includes(clientIp)) {
            await Session.updateOne(
                { sessionToken },
                {
                    ...updates,
                    $addToSet: { usedIps: clientIp }
                }
            );
        } else {
            await Session.updateOne({ sessionToken }, updates);
        }

        // Attach user data to request object
        req.user = session.userData;
        req.session = {
            token: sessionToken,
            login: session.login,
            campusId: session.campusId
        };

        return true;
    } catch (error) {
        console.error('Authentication error:', error instanceof Error ? error.message : 'Unknown error');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Authentication service unavailable'
        });
        return false;
    }
}

/**
 * Set CORS headers for response
 */
export function setCorsHeaders(res: VercelResponse): void {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );
}

/**
 * Handle OPTIONS preflight request
 */
export function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return true;
    }
    return false;
}
