import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../_lib/mongodb';
import { Student } from '../_models/index';
import { getProjectReviewModel } from '../_models/ProjectReview';
import { validateCampusId } from '../_lib/validators';
import { authenticate, setCorsHeaders, handleOptions, type AuthenticatedRequest } from '../_lib/auth';

/**
 * Validate and sanitize login string
 */
function validateLoginString(input: string | undefined): string | null {
    if (!input || typeof input !== 'string') {
        return null;
    }
    const sanitized = input.replace(/[^a-zA-Z0-9_-]/g, '');
    return sanitized.substring(0, 50);
}

/**
 * Validate date string (YYYY-MM-DD format)
 */
function validateDateString(input: string | undefined): string | null {
    if (!input || typeof input !== 'string') {
        return null;
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(input)) {
        return null;
    }
    return input;
}

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

        const ProjectReview = getProjectReviewModel();

        // Handle action=statuses - return unique statuses
        if (req.query.action === 'statuses') {
            const statuses = await ProjectReview.distinct('status');
            const validStatuses = statuses.filter((s: unknown) => s !== null && s !== undefined);
            return res.json({ statuses: validStatuses.sort() });
        }

        // Handle action=projectNames - return unique project names
        if (req.query.action === 'projectNames') {
            const projectNames = await ProjectReview.distinct('project');
            return res.json({ projectNames: projectNames.sort() });
        }

        // Validate campusId
        let validatedCampusId: number | null = null;
        try {
            validatedCampusId = validateCampusId(req.query.campusId as string);
        } catch (validationError) {
            return res.status(400).json({
                error: 'Bad Request',
                message: validationError instanceof Error ? validationError.message : 'Invalid campus ID'
            });
        }

        // Parse and validate pagination
        const page = parseInt(req.query.page as string, 10);
        const limit = parseInt(req.query.limit as string, 10);

        const validatedPage = (!isNaN(page) && page > 0) ? page : 1;
        const validatedLimit = (!isNaN(limit) && limit > 0 && limit <= 100) ? limit : 50;
        const skip = (validatedPage - 1) * validatedLimit;

        // Build filter with validation
        const filter: Record<string, unknown> = {};

        // Campus filter
        if (validatedCampusId !== null) {
            filter.campusId = validatedCampusId;
        }

        // Project name filter
        if (req.query.projectName && typeof req.query.projectName === 'string') {
            const sanitizedProject = req.query.projectName.replace(/[^a-zA-Z0-9\s._-]/g, '').substring(0, 100);
            if (sanitizedProject) {
                filter.project = sanitizedProject;
            }
        }

        // Evaluator filter
        const sanitizedEvaluator = validateLoginString(req.query.evaluatorLogin as string);
        if (sanitizedEvaluator) {
            filter.evaluator = new RegExp(sanitizedEvaluator, 'i');
        }

        // Evaluated filter
        const sanitizedEvaluated = validateLoginString(req.query.evaluatedLogin as string);
        if (sanitizedEvaluated) {
            filter.evaluated = new RegExp(sanitizedEvaluated, 'i');
        }

        // Status filter
        if (req.query.status && typeof req.query.status === 'string') {
            const sanitizedStatus = req.query.status.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
            if (sanitizedStatus) {
                filter.status = sanitizedStatus;
            }
        }

        // Score filter
        if (req.query.score) {
            const score = parseInt(req.query.score as string, 10);
            if (!isNaN(score) && score >= -42 && score <= 125) {
                filter.score = score;
            }
        }

        // Search in comments
        if (req.query.search && typeof req.query.search === 'string') {
            const sanitizedSearch = req.query.search.replace(/[^a-zA-Z0-9\s._-]/g, '').trim().substring(0, 200);
            if (sanitizedSearch) {
                filter.evaluatorComment = new RegExp(sanitizedSearch, 'i');
            }
        }

        // Date filters
        if (req.query.dateFilter && typeof req.query.dateFilter === 'string') {
            const validatedDateFrom = validateDateString(req.query.dateFrom as string);

            if (validatedDateFrom) {
                switch (req.query.dateFilter) {
                    case 'after':
                        filter.date = { $gte: validatedDateFrom };
                        break;
                    case 'before':
                        filter.date = { $lte: validatedDateFrom };
                        break;
                    case 'between':
                        const validatedDateTo = validateDateString(req.query.dateTo as string);
                        if (validatedDateTo) {
                            filter.date = {
                                $gte: validatedDateFrom,
                                $lte: validatedDateTo
                            };
                        }
                        break;
                }
            }
        }

        // Execute query with pagination
        const [reviews, total] = await Promise.all([
            ProjectReview.find(filter)
                .sort({ date: -1, createdAt: -1 })
                .skip(skip)
                .limit(validatedLimit)
                .lean(),
            ProjectReview.countDocuments(filter)
        ]);

        // Enrich reviews with student data
        const enrichedReviews = await Promise.all(
            reviews.map(async (review: Record<string, unknown>) => {
                const [evaluatorData, evaluatedData] = await Promise.all([
                    Student.findOne({ login: review.evaluator })
                        .select('id login displayname image')
                        .lean(),
                    Student.findOne({ login: review.evaluated })
                        .select('id login displayname image')
                        .lean()
                ]);

                return {
                    ...review,
                    evaluatorData: evaluatorData ? {
                        id: (evaluatorData as Record<string, unknown>).id,
                        login: (evaluatorData as Record<string, unknown>).login,
                        displayname: (evaluatorData as Record<string, unknown>).displayname,
                        image: (evaluatorData as Record<string, unknown>).image
                    } : null,
                    evaluatedData: evaluatedData ? {
                        id: (evaluatedData as Record<string, unknown>).id,
                        login: (evaluatedData as Record<string, unknown>).login,
                        displayname: (evaluatedData as Record<string, unknown>).displayname,
                        image: (evaluatedData as Record<string, unknown>).image
                    } : null
                };
            })
        );

        const totalPages = Math.ceil(total / validatedLimit);

        res.json({
            reviews: enrichedReviews,
            pagination: {
                total,
                page: validatedPage,
                limit: validatedLimit,
                totalPages
            }
        });
    } catch (error) {
        console.error('Reviews fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch reviews',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
