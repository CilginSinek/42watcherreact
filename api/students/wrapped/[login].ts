import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../../lib/mongodb';
import { Student, Project, Feedback, Patronage } from '../../models/index';
import { getProjectReviewModel } from '../../models/ProjectReview';
import { validateLogin } from '../../lib/validators';
import { logEvent } from '../../lib/logger';
import { generateWrappedSummary } from '../../lib/wrappedController';
import { authenticate, setCorsHeaders, handleOptions, type AuthenticatedRequest } from '../../lib/auth';

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

        // Get login from URL path
        const login = req.query.login as string;

        let validatedLogin: string;
        try {
            validatedLogin = validateLogin(login);
        } catch (validationError) {
            return res.status(400).json({
                error: 'Bad Request',
                message: validationError instanceof Error ? validationError.message : 'Invalid login'
            });
        }

        const student = await Student.findOne({ login: validatedLogin }).lean();
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const ProjectReview = getProjectReviewModel();

        // Get 2025 date range
        const year2025Start = '2025-01-01T00:00:00.000Z';
        const year2025End = '2025-12-31T23:59:59.999Z';

        // Fetch all necessary data in parallel
        const [projects, projectReviews, feedbacks, projectReviewsReceived, feedbacksReceived, patronage, projectReviewsForWords, feedbacksForWords] = await Promise.all([
            Project.find({
                login: validatedLogin,
                date: { $gte: year2025Start, $lte: year2025End }
            }).lean(),

            ProjectReview.find({
                evaluator: validatedLogin,
                date: { $gte: year2025Start, $lte: year2025End }
            }).lean(),

            Feedback.find({
                evaluator: validatedLogin,
                date: { $gte: year2025Start, $lte: year2025End }
            }).lean(),

            ProjectReview.find({
                evaluated: validatedLogin,
                date: { $gte: year2025Start, $lte: year2025End }
            }).lean(),

            Feedback.find({
                evaluated: validatedLogin,
                date: { $gte: year2025Start, $lte: year2025End }
            }).lean(),

            Patronage.findOne({ login: validatedLogin }).lean(),

            ProjectReview.find(
                {
                    evaluator: validatedLogin,
                    date: { $gte: year2025Start, $lte: year2025End },
                    comment: { $exists: true, $ne: null, $ne: '' }
                },
                { comment: 1, _id: 0 }
            ).lean(),

            Feedback.find(
                {
                    evaluated: validatedLogin,
                    date: { $gte: year2025Start, $lte: year2025End },
                    comment: { $exists: true, $ne: null, $ne: '' }
                },
                { comment: 1, _id: 0 }
            ).lean()
        ]);

        // Generate wrapped summary
        const studentData = student as Record<string, unknown>;
        const wrappedData = generateWrappedSummary({
            student: {
                pool_year: studentData.pool_year as string,
                login: studentData.login as string,
                displayname: studentData.displayname as string,
                image: studentData.image
            },
            projects: projects as Array<{ project?: string; date?: string; status?: string; score?: number }>,
            projectReviews: projectReviews as Array<{ project?: string; evaluated?: string; evaluator?: string; date?: string; comment?: string }>,
            feedbacks: feedbacks as Array<{ evaluated?: string; evaluator?: string; date?: string; comment?: string }>,
            projectReviewsReceived: projectReviewsReceived as Array<{ project?: string; evaluated?: string; evaluator?: string; date?: string; comment?: string }>,
            feedbacksReceived: feedbacksReceived as Array<{ evaluated?: string; evaluator?: string; date?: string; comment?: string }>,
            patronage: patronage as { godfathers?: Array<{ login: string }>; children?: Array<{ login: string }> } | null,
            projectReviewsForWords: projectReviewsForWords as Array<{ comment?: string }>,
            feedbacksForWords: feedbacksForWords as Array<{ comment?: string }>
        });

        // Collect all unique logins from highlights to fetch their images
        const loginsToFetch = new Set<string>();
        const highlights = wrappedData.highlights as Record<string, unknown>;
        if ((highlights?.mostEvaluatedUser as Record<string, unknown>)?.login) {
            loginsToFetch.add((highlights.mostEvaluatedUser as Record<string, unknown>).login as string);
        }
        if ((highlights?.mostEvaluatorUser as Record<string, unknown>)?.login) {
            loginsToFetch.add((highlights.mostEvaluatorUser as Record<string, unknown>).login as string);
        }

        // Fetch student images for all logins
        if (loginsToFetch.size > 0) {
            const students = await Student.find(
                { login: { $in: Array.from(loginsToFetch) } },
                { login: 1, image: 1 }
            ).lean();

            const loginImageMap: Record<string, unknown> = {};
            (students as Array<Record<string, unknown>>).forEach(s => {
                loginImageMap[s.login as string] = s.image;
            });

            // Add images to highlights
            if ((highlights?.mostEvaluatedUser as Record<string, unknown>)?.login) {
                (highlights.mostEvaluatedUser as Record<string, unknown>).image = loginImageMap[(highlights.mostEvaluatedUser as Record<string, unknown>).login as string] || null;
            }
            if ((highlights?.mostEvaluatorUser as Record<string, unknown>)?.login) {
                (highlights.mostEvaluatorUser as Record<string, unknown>).image = loginImageMap[(highlights.mostEvaluatorUser as Record<string, unknown>).login as string] || null;
            }
        }

        const result = {
            ...wrappedData,
            user: {
                login: studentData.login,
                displayname: studentData.displayname,
                image: studentData.image
            },
            watcherUser: {
                login: authReq.user?.login || 'unknown',
                displayname: authReq.user?.displayname || 'Unknown User',
                image: authReq.user?.image || null
            }
        };

        // Log the event
        logEvent(
            req,
            authReq.user?.login as string || 'unknown',
            studentData?.campusId as number || 0,
            'student_wrapped_view',
            { viewedLogin: validatedLogin, year: 2025 }
        );

        res.status(200).json(result);
    } catch (error) {
        console.error('Wrapped generation error:', error);
        res.status(500).json({
            error: 'Failed to generate wrapped summary',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
