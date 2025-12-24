import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../_lib/mongodb';
import { Student, Project, LocationStats, Feedback, Patronage } from '../_models/index';
import { getProjectReviewModel } from '../_models/ProjectReview';
import { validateLogin } from '../_lib/validators';
import { logEvent } from '../_lib/logger';
import { generateWrappedSummary } from '../_lib/wrappedController';
import { authenticate, setCorsHeaders, handleOptions, type AuthenticatedRequest } from '../_lib/auth';

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

        const studentData = student as Record<string, unknown>;

        // Handle action=wrapped - return 2025 wrapped summary
        if (req.query.action === 'wrapped') {
            const ProjectReview = getProjectReviewModel();

            const year2025Start = '2025-01-01T00:00:00.000Z';
            const year2025End = '2025-12-31T23:59:59.999Z';

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
                        comment: { $exists: true, $nin: [null, ''] }
                    },
                    { comment: 1, _id: 0 }
                ).lean(),

                Feedback.find(
                    {
                        evaluated: validatedLogin,
                        date: { $gte: year2025Start, $lte: year2025End },
                        comment: { $exists: true, $nin: [null, ''] }
                    },
                    { comment: 1, _id: 0 }
                ).lean()
            ]);

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

            const loginsToFetch = new Set<string>();
            const highlights = wrappedData.highlights as Record<string, unknown>;
            if ((highlights?.mostEvaluatedUser as Record<string, unknown>)?.login) {
                loginsToFetch.add((highlights.mostEvaluatedUser as Record<string, unknown>).login as string);
            }
            if ((highlights?.mostEvaluatorUser as Record<string, unknown>)?.login) {
                loginsToFetch.add((highlights.mostEvaluatorUser as Record<string, unknown>).login as string);
            }

            if (loginsToFetch.size > 0) {
                const students = await Student.find(
                    { login: { $in: Array.from(loginsToFetch) } },
                    { login: 1, image: 1 }
                ).lean();

                const loginImageMap: Record<string, unknown> = {};
                (students as Array<Record<string, unknown>>).forEach(s => {
                    loginImageMap[s.login as string] = s.image;
                });

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

            logEvent(
                req,
                authReq.user?.login as string || 'unknown',
                studentData?.campusId as number || 0,
                'student_wrapped_view',
                { viewedLogin: validatedLogin, year: 2025 }
            );

            return res.status(200).json(result);
        }

        // DEFAULT: Return student details
        const projects = await Project.find({ login: validatedLogin }).lean();
        const projectsData = projects.map((p: Record<string, unknown>) => ({
            project: p.project,
            login: p.login,
            score: p.score,
            status: p.status,
            date: p.date,
            campusId: p.campusId,
            penaltyDate: p.penaltyDate,
        }));

        const locationData = await LocationStats.findOne({ login: validatedLogin }).lean();

        const logTimes: Array<{ date: string; duration: number }> = [];
        const dayAttendance: Record<string, number[]> = {
            Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: []
        };
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        interface LocationDoc {
            months?: Record<string, { days?: Record<string, string> }>;
        }

        if ((locationData as LocationDoc)?.months) {
            for (const [monthKey, monthData] of Object.entries((locationData as LocationDoc).months!)) {
                if (monthData.days) {
                    for (const [day, durationStr] of Object.entries(monthData.days)) {
                        if (durationStr && durationStr !== '00:00:00') {
                            const parts = durationStr.split(':');
                            const hours = parseInt(parts[0]) || 0;
                            const minutes = parseInt(parts[1]) || 0;
                            const seconds = parseInt(parts[2]) || 0;
                            const totalMinutes = hours * 60 + minutes + Math.floor(seconds / 60);

                            const date = `${monthKey}-${day.padStart(2, '0')}`;
                            logTimes.push({ date, duration: totalMinutes });

                            const fullDate = new Date(`${monthKey}-${day.padStart(2, '0')}`);
                            if (!isNaN(fullDate.getTime())) {
                                const dayOfWeek = dayNames[fullDate.getDay()];
                                if (dayAttendance[dayOfWeek]) {
                                    dayAttendance[dayOfWeek].push(hours + minutes / 60);
                                }
                            }
                        }
                    }
                }
            }
        }

        const feedbacks = await Feedback.find({ evaluated: validatedLogin }).lean();
        const feedbackCount = feedbacks.length;
        const avgRating = feedbackCount > 0
            ? feedbacks.reduce((sum: number, f: Record<string, unknown>) => sum + ((f.rating as number) || 0), 0) / feedbackCount
            : 0;

        const attendanceDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
            day,
            avgHours: dayAttendance[day].length > 0
                ? dayAttendance[day].reduce((sum, h) => sum + h, 0) / dayAttendance[day].length
                : 0
        }));

        const patronageData = await Patronage.findOne({ login: validatedLogin }).lean();
        const children = (patronageData as Record<string, unknown>)?.children || [];
        const godfathers = (patronageData as Record<string, unknown>)?.godfathers || [];

        logEvent(
            req,
            authReq.user?.login as string || 'unknown',
            (student as Record<string, unknown>)?.campusId as number || 0,
            'student_detail_view',
            { viewedLogin: validatedLogin, hasProjects: projects.length > 0 }
        );

        res.json({
            student: {
                id: studentData.id,
                login: studentData.login,
                displayname: studentData.displayname,
                email: studentData.email,
                image: studentData.image,
                correction_point: studentData.correction_point,
                wallet: studentData.wallet,
                location: studentData.location,
                "active?": studentData["active?"],
                "alumni?": studentData["alumni?"],
                is_piscine: studentData.is_piscine,
                is_trans: studentData.is_trans,
                grade: studentData.grade,
                project_count: projects.length,
                projects: projectsData,
                patronage: { godfathers, children },
                feedbackCount,
                avgRating: Math.round(avgRating * 100) / 100,
                logTimes,
                attendanceDays,
            }
        });
    } catch (error) {
        console.error('Student fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch student',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
