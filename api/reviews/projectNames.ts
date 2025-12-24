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

        const projectNames = await ProjectReview.distinct('project');
        res.json({ projectNames: projectNames.sort() });
    } catch (error) {
        console.error('Project names fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch project names',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
