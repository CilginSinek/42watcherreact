import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../lib/mongodb';
import { getProjectReviewModel } from '../models/ProjectReview';
import { setCorsHeaders, handleOptions } from '../lib/auth';

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

        // This is a public endpoint - no authentication required
        const ProjectReview = getProjectReviewModel();

        const statuses = await ProjectReview.distinct('status');
        // Filter out null values
        const validStatuses = statuses.filter((s: unknown) => s !== null && s !== undefined);
        res.json({ statuses: validStatuses.sort() });
    } catch (error) {
        console.error('Statuses fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch statuses',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
