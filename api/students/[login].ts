import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../lib/mongodb';
import { Student, Project, LocationStats, Feedback, Patronage } from '../models/index';
import { validateLogin } from '../lib/validators';
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

        // Get projects
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

        // Get location stats
        const locationData = await LocationStats.findOne({ login: validatedLogin }).lean();

        // Parse logTimes and attendanceDays
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

        // Get feedbacks
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

        // Get patronage
        const patronageData = await Patronage.findOne({ login: validatedLogin }).lean();
        const children = (patronageData as Record<string, unknown>)?.children || [];
        const godfathers = (patronageData as Record<string, unknown>)?.godfathers || [];

        // Log the event
        logEvent(
            req,
            authReq.user?.login as string || 'unknown',
            (student as Record<string, unknown>)?.campusId as number || 0,
            'student_detail_view',
            { viewedLogin: validatedLogin, hasProjects: projects.length > 0 }
        );

        const studentData = student as Record<string, unknown>;
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
