import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../lib/mongodb';
import { Student, Project } from '../models/index';
import { validateCampusId, validateSearch, validatePool, validateStatus, validateSort, validateOrder, validateLimit } from '../lib/validators';
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

        // Handle action=pools - return unique pool combinations
        if (req.query.action === 'pools') {
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

            logEvent(
                req,
                authReq.user?.login as string || 'unknown',
                validatedCampusId || 0,
                'student_pools_view',
                { campusId: validatedCampusId, poolCount: pools.length }
            );

            return res.json({ pools });
        }

        // Validate inputs
        let validatedCampusId: number | null, validatedSearch: string, validatedPool: { month: string; year: string } | null, validatedStatus: string | null;
        let validatedSort: string, validatedOrder: 'asc' | 'desc', validatedLimit: number, validatedPage: number;

        try {
            validatedCampusId = validateCampusId(req.query.campusId as string);
            validatedSearch = validateSearch(req.query.search as string);
            validatedPool = validatePool(req.query.poolYear as string, req.query.poolMonth as string);
            validatedStatus = validateStatus(req.query.status as string);
            validatedSort = validateSort(req.query.sortBy as string);
            validatedOrder = validateOrder(req.query.order as string);
            validatedPage = parseInt(req.query.page as string, 10) || 1;
            validatedLimit = Math.min(validateLimit(req.query.limit as string), 50);
        } catch (validationError) {
            return res.status(400).json({
                error: 'Bad Request',
                message: validationError instanceof Error ? validationError.message : 'Invalid parameters'
            });
        }

        const skip = (validatedPage - 1) * validatedLimit;
        const sortOrder = validatedOrder === 'asc' ? 1 : -1;

        // Build match filters
        const matchStage: Record<string, unknown> = {};

        if (validatedCampusId !== null) {
            matchStage.campusId = validatedCampusId;
        }

        if (validatedPool) {
            matchStage.pool_month = validatedPool.month;
            matchStage.pool_year = validatedPool.year;
        }

        if (validatedSearch) {
            const searchRegex = new RegExp(validatedSearch, 'i');
            matchStage.$or = [
                { login: searchRegex },
                { displayname: searchRegex },
                { email: searchRegex }
            ];
        }

        // Status filters
        switch (validatedStatus) {
            case "active":
                matchStage["active?"] = true;
                break;
            case "inactive":
                matchStage["active?"] = false;
                break;
            case "test":
                matchStage.is_test = true;
                break;
            case "alumni":
                matchStage["alumni?"] = true;
                break;
            case "staff":
                matchStage["staff?"] = true;
                break;
            case "blackholed":
                matchStage.blackholed = true;
                break;
            case "transcender":
                matchStage.grade = 'Transcender';
                break;
            case "cadet":
                matchStage["active?"] = true;
                matchStage.grade = 'Cadet';
                break;
            case "piscine":
                matchStage.is_piscine = true;
                break;
            case "sinker":
                matchStage.sinker = true;
                break;
            case "freeze":
                matchStage.freeze = true;
                break;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let pipeline: any[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let countPipeline: any[] = [];

        // Build aggregation pipeline based on sort type
        switch (validatedSort) {
            case "login":
            case "level":
            case "wallet":
            case "correction_point":
                pipeline = [
                    { $match: matchStage },
                    {
                        $lookup: {
                            from: 'projects',
                            let: { studentLogin: '$login' },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ['$login', '$$studentLogin'] },
                                                { $eq: ['$score', -42] }
                                            ]
                                        }
                                    }
                                },
                                { $limit: 1 }
                            ],
                            as: 'cheatProjects'
                        }
                    },
                    {
                        $addFields: {
                            has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] }
                        }
                    },
                    { $project: { cheatProjects: 0 } },
                    { $sort: { [validatedSort]: sortOrder } },
                    { $skip: skip },
                    { $limit: validatedLimit }
                ];
                countPipeline = [{ $match: matchStage }, { $count: 'total' }];
                break;

            case "project_count":
                pipeline = [
                    { $match: matchStage },
                    {
                        $lookup: {
                            from: 'projects',
                            localField: 'login',
                            foreignField: 'login',
                            as: 'projects'
                        }
                    },
                    {
                        $lookup: {
                            from: 'projects',
                            let: { studentLogin: '$login' },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ['$login', '$$studentLogin'] },
                                                { $eq: ['$score', -42] }
                                            ]
                                        }
                                    }
                                },
                                { $limit: 1 }
                            ],
                            as: 'cheatProjects'
                        }
                    },
                    {
                        $addFields: {
                            project_count: { $size: '$projects' },
                            has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] }
                        }
                    },
                    { $project: { projects: 0, cheatProjects: 0 } },
                    { $sort: { project_count: sortOrder } },
                    { $skip: skip },
                    { $limit: validatedLimit }
                ];
                countPipeline = [{ $match: matchStage }, { $count: 'total' }];
                break;

            case "cheat_count":
                pipeline = [
                    {
                        $lookup: {
                            from: 'projects',
                            let: { studentLogin: '$login' },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ['$login', '$$studentLogin'] },
                                                { $eq: ['$score', -42] }
                                            ]
                                        }
                                    }
                                }
                            ],
                            as: 'cheatProjects'
                        }
                    },
                    {
                        $addFields: {
                            cheat_count: { $size: '$cheatProjects' }
                        }
                    },
                    { $match: { ...matchStage, cheat_count: { $gt: 0 } } },
                    {
                        $addFields: {
                            has_cheats: true
                        }
                    },
                    { $project: { cheatProjects: 0 } },
                    { $sort: { cheat_count: sortOrder } },
                    { $skip: skip },
                    { $limit: validatedLimit }
                ];
                countPipeline = [
                    {
                        $lookup: {
                            from: 'projects',
                            let: { studentLogin: '$login' },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ['$login', '$$studentLogin'] },
                                                { $eq: ['$score', -42] }
                                            ]
                                        }
                                    }
                                }
                            ],
                            as: 'cheatProjects'
                        }
                    },
                    {
                        $addFields: {
                            cheat_count: { $size: '$cheatProjects' }
                        }
                    },
                    { $match: { ...matchStage, cheat_count: { $gt: 0 } } },
                    { $count: 'total' }
                ];
                break;

            case "godfather_count":
            case "children_count":
                pipeline = [
                    { $match: matchStage },
                    {
                        $lookup: {
                            from: 'patronages',
                            localField: 'login',
                            foreignField: 'login',
                            as: 'patronage'
                        }
                    },
                    {
                        $lookup: {
                            from: 'projects',
                            let: { studentLogin: '$login' },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ['$login', '$$studentLogin'] },
                                                { $eq: ['$score', -42] }
                                            ]
                                        }
                                    }
                                },
                                { $limit: 1 }
                            ],
                            as: 'cheatProjects'
                        }
                    },
                    {
                        $addFields: {
                            godfather_count: {
                                $size: {
                                    $ifNull: [{ $arrayElemAt: ['$patronage.godfathers', 0] }, []]
                                }
                            },
                            children_count: {
                                $size: {
                                    $ifNull: [{ $arrayElemAt: ['$patronage.children', 0] }, []]
                                }
                            },
                            has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] }
                        }
                    },
                    { $project: { patronage: 0, cheatProjects: 0 } },
                    { $sort: { [validatedSort]: sortOrder } },
                    { $skip: skip },
                    { $limit: validatedLimit }
                ];
                countPipeline = [{ $match: matchStage }, { $count: 'total' }];
                break;

            case "feedback_count":
                pipeline = [
                    { $match: matchStage },
                    {
                        $lookup: {
                            from: 'feedbacks',
                            localField: 'login',
                            foreignField: 'evaluated',
                            as: 'feedbacks'
                        }
                    },
                    {
                        $lookup: {
                            from: 'projects',
                            let: { studentLogin: '$login' },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ['$login', '$$studentLogin'] },
                                                { $eq: ['$score', -42] }
                                            ]
                                        }
                                    }
                                },
                                { $limit: 1 }
                            ],
                            as: 'cheatProjects'
                        }
                    },
                    {
                        $addFields: {
                            feedback_count: { $size: '$feedbacks' },
                            has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] }
                        }
                    },
                    { $project: { feedbacks: 0, cheatProjects: 0 } },
                    { $sort: { feedback_count: sortOrder } },
                    { $skip: skip },
                    { $limit: validatedLimit }
                ];
                countPipeline = [{ $match: matchStage }, { $count: 'total' }];
                break;

            case "avg_rating":
                pipeline = [
                    { $match: matchStage },
                    {
                        $lookup: {
                            from: 'feedbacks',
                            let: { studentLogin: '$login' },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ['$evaluated', '$$studentLogin'] },
                                                { $ne: ['$rating', null] }
                                            ]
                                        }
                                    }
                                }
                            ],
                            as: 'feedbacks'
                        }
                    },
                    {
                        $lookup: {
                            from: 'projects',
                            let: { studentLogin: '$login' },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ['$login', '$$studentLogin'] },
                                                { $eq: ['$score', -42] }
                                            ]
                                        }
                                    }
                                },
                                { $limit: 1 }
                            ],
                            as: 'cheatProjects'
                        }
                    },
                    {
                        $addFields: {
                            avg_rating: { $avg: '$feedbacks.rating' },
                            has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] }
                        }
                    },
                    { $project: { feedbacks: 0, cheatProjects: 0 } },
                    { $sort: { avg_rating: sortOrder } },
                    { $skip: skip },
                    { $limit: validatedLimit }
                ];
                countPipeline = [{ $match: matchStage }, { $count: 'total' }];
                break;

            default:
                pipeline = [
                    { $match: matchStage },
                    { $sort: { login: sortOrder } },
                    { $skip: skip },
                    { $limit: validatedLimit }
                ];
                countPipeline = [{ $match: matchStage }, { $count: 'total' }];
        }

        // Execute aggregation and count in parallel
        const [students, countResult] = await Promise.all([
            Student.aggregate(pipeline),
            Student.aggregate(countPipeline)
        ]);

        const total = countResult.length > 0 ? countResult[0].total : 0;
        const totalPages = Math.ceil(total / validatedLimit);

        // Log the event
        logEvent(
            req,
            authReq.user?.login as string || 'unknown',
            validatedCampusId || 0,
            'student_list_view',
            {
                campusId: validatedCampusId,
                sortBy: validatedSort,
                order: validatedOrder,
                pool: validatedPool,
                status: validatedStatus,
                search: validatedSearch,
                page: validatedPage,
                limit: validatedLimit,
                totalResults: total
            }
        );

        res.json({
            students,
            pagination: {
                total,
                page: validatedPage,
                limit: validatedLimit,
                totalPages
            }
        });

    } catch (error) {
        console.error('Students list error:', error);
        res.status(500).json({
            error: 'Failed to fetch students',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
