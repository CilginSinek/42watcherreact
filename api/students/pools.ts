import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../lib/mongodb';
import { Student } from '../models/index';
import { validateCampusId } from '../lib/validators';
import { logEvent } from '../lib/logger';
import { authenticate, setCorsHeaders, handleOptions, type AuthenticatedRequest } from '../lib/auth';

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    setCorsHeaders(res);

    if (handleOptions(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        await connectDB();

        // Authenticate
        const isAuthenticated = await authenticate(req as AuthenticatedRequest, res);
        if (!isAuthenticated) return;

        const authReq = req as AuthenticatedRequest;

        let validatedCampusId: number | null = null;
        try {
            validatedCampusId = validateCampusId(req.query.campusId as string);
        } catch (validationError) {
            return res.status(400).json({
                error: 'Bad Request',
                message: validationError instanceof Error ? validationError.message : 'Invalid campus ID'
            });
        }

        const filter = validatedCampusId !== null ? { campusId: validatedCampusId } : {};

        // Use MongoDB aggregation for better performance
        const pools = await Student.aggregate([
            { $match: filter },
            {
                $match: {
                    pool_month: { $exists: true, $ne: null },
                    pool_year: { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: {
                        month: '$pool_month',
                        year: '$pool_year'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    month: '$_id.month',
                    year: '$_id.year',
                    count: 1
                }
            }
        ]);

        // Log the event
        logEvent(
            req,
            authReq.user?.login as string || 'unknown',
            validatedCampusId || 0,
            'student_pools_view',
            { campusId: validatedCampusId, poolCount: pools.length }
        );

        res.json({ pools });
    } catch (error) {
        console.error('Pools fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch pools data',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
