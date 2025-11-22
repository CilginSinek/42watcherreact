import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Student, Project, Feedback } from '../models/Student.js';

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define MONGODB_URI environment variable');
}

interface CachedConnection {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: CachedConnection | undefined;
}

const cached: CachedConnection = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI!, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

/**
 * REQUIRED INDEXES FOR OPTIMAL PERFORMANCE:
 * 
 * Students collection:
 *   db.students.createIndex({ login: 1 })
 *   db.students.createIndex({ campusId: 1 })
 *   db.students.createIndex({ login: 1, campusId: 1 })
 *   db.students.createIndex({ correction_point: -1 })
 *   db.students.createIndex({ wallet: -1 })
 *   db.students.createIndex({ created_at: -1 })
 * 
 * Projects collection:
 *   db.projects.createIndex({ login: 1 })
 *   db.projects.createIndex({ login: 1, status: 1, score: 1 })
 * 
 * Patronages collection:
 *   db.patronages.createIndex({ login: 1 })
 * 
 * LocationStats collection:
 *   db.locationstats.createIndex({ login: 1 })
 */

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if running on localhost (skip auth for local development)
  const isLocalhost = req.headers.host?.includes('localhost') || req.headers.host?.includes('127.0.0.1');

  // Authorization kontrolü (skip for localhost)
  if (!isLocalhost) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];

    // Token'ı 42 API ile doğrula
    try {
      const verifyResponse = await fetch('https://api.intra.42.fr/v2/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!verifyResponse.ok) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({ error: 'Token verification failed' });
    }
  }

  try {
    await connectDB();

    // small helper to safely escape user input used in regex
    const escapeRegex = (str: string) => {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    // Query parametreleri
    const { 
      search, 
      status,
      campusId,
      sortBy = 'login',
      order = 'asc',
      limit = '100',
      page = '1'
    } = req.query;

    // Filter oluştur
    const matchFilter: Record<string, unknown> = {};

    // Campus filter
    if (campusId && typeof campusId === 'string') {
      matchFilter.campusId = parseInt(campusId);
    }

    // Search filter (escape user input to prevent regex injection / ReDoS)
    if (search && typeof search === 'string') {
      const escaped = escapeRegex(search);
      const safeRegex = new RegExp(escaped, 'i');
      matchFilter.$or = [
        { login: safeRegex },
        { displayname: safeRegex },
        { email: safeRegex }
      ];
    }

    // Status filter
    if (status && typeof status === 'string') {
      switch (status) {
        case 'staff':
          matchFilter['staff?'] = true;
          break;
        case 'test':
          matchFilter.is_test = true;
          break;
        case 'active':
          matchFilter['active?'] = true;
          matchFilter['alumni?'] = { $ne: true };
          matchFilter.blackholed = { $ne: true };
          matchFilter.is_piscine = false;
          break;
        case 'blackhole':
          matchFilter.blackholed = true;
          break;
        case 'piscine':
          matchFilter.is_piscine = true;
          break;
        case 'transfer':
          matchFilter.is_trans = true;
          break;
        case 'alumni':
          matchFilter['alumni?'] = true;
          break;
        case 'sinker':
          matchFilter.sinker = true;
          break;
        case 'freeze':
          matchFilter.freeze = true;
          break;
        case 'cheaters': {
          const cheaterLogins = await Project.distinct('login', { 
            status: 'fail',
            score: -42 
          });
          matchFilter.login = { $in: cheaterLogins };
          break;
        }
      }
    }

    // Pagination
    const limitNum = parseInt(limit as string) || 100;
    const pageNum = parseInt(page as string) || 1;
    const skip = (pageNum - 1) * limitNum;
    const sortOrder = order === 'desc' ? -1 : 1;

    // Sort field mapping
    const sortFieldMap: Record<string, string> = {
      'godfather_count': 'godfatherCount',
      'children_count': 'childrenCount',
      'cheat_count': 'cheatCount',
      'project_count': 'projectCount',
      'log_time': 'logTime',
      'evo_performance': 'evoPerformance',
      'feedback_count': 'feedbackCount',
      'avg_rating': 'avgRating',
      'wallet': 'wallet',
      'correction_point': 'correction_point',
      'login': 'login'
    };

  // Only allow known sort fields; fallback to 'login' for safety
  const actualSortField = sortFieldMap[sortBy as string] ?? 'login';

    // TWO-PHASE AGGREGATION APPROACH FOR FREE-TIER MONGODB
    // Phase 1: Lightweight pipeline to get sorted logins only
    // Phase 2: Detailed data fetch for selected logins only
    
    // PHASE 1: Lightweight aggregation for sorting and pagination
    // Only calculate fields needed for sorting, keep documents small
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const smallPipeline: any[] = [
      { $match: matchFilter }
    ];

    // Add only the necessary lookup for the sort field
    if (actualSortField === 'projectCount' || actualSortField === 'cheatCount') {
      smallPipeline.push({
        $lookup: {
          from: 'projects',
          let: { login: '$login' },
          pipeline: [
            { $match: { $expr: { $eq: ['$login', '$$login'] } } },
            {
              $group: {
                _id: null,
                projectCount: {
                  $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
                },
                cheatCount: {
                  $sum: {
                    $cond: [
                      { $and: [{ $eq: ['$status', 'fail'] }, { $eq: ['$score', -42] }] },
                      1,
                      0
                    ]
                  }
                }
              }
            }
          ],
          as: 'projectStats'
        }
      });
      smallPipeline.push({
        $addFields: {
          projectCount: { $ifNull: [{ $arrayElemAt: ['$projectStats.projectCount', 0] }, 0] },
          cheatCount: { $ifNull: [{ $arrayElemAt: ['$projectStats.cheatCount', 0] }, 0] }
        }
      });
    } else if (actualSortField === 'godfatherCount' || actualSortField === 'childrenCount') {
      smallPipeline.push({
        $lookup: {
          from: 'patronages',
          let: { login: '$login' },
          pipeline: [
            { $match: { $expr: { $eq: ['$login', '$$login'] } } },
            {
              $project: {
                godfatherCount: { $size: { $ifNull: ['$godfathers', []] } },
                childrenCount: { $size: { $ifNull: ['$children', []] } }
              }
            }
          ],
          as: 'patronageStats'
        }
      });
      smallPipeline.push({
        $addFields: {
          godfatherCount: { $ifNull: [{ $arrayElemAt: ['$patronageStats.godfatherCount', 0] }, 0] },
          childrenCount: { $ifNull: [{ $arrayElemAt: ['$patronageStats.childrenCount', 0] }, 0] }
        }
      });
    } else if (actualSortField === 'logTime') {
      smallPipeline.push({
        $lookup: {
          from: 'locationstats',
          let: { login: '$login' },
          pipeline: [
            { $match: { $expr: { $eq: ['$login', '$$login'] } } },
            { $project: { months: 1 } }
          ],
          as: 'locationData'
        }
      });
      smallPipeline.push({
        $addFields: {
          logTime: {
            $reduce: {
              input: { $objectToArray: { $ifNull: [{ $arrayElemAt: ['$locationData.months', 0] }, {}] } },
              initialValue: 0,
              in: {
                $add: [
                  '$$value',
                  {
                    $let: {
                      vars: {
                        timeParts: { $split: [{ $ifNull: ['$$this.v.totalDuration', '00:00:00'] }, ':'] }
                      },
                      in: {
                        $add: [
                          { $multiply: [{ $toInt: { $arrayElemAt: ['$$timeParts', 0] } }, 3600] },
                          { $multiply: [{ $toInt: { $arrayElemAt: ['$$timeParts', 1] } }, 60] },
                          { $toInt: { $arrayElemAt: ['$$timeParts', 2] } }
                        ]
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      });
    } else if (actualSortField === 'evoPerformance' || actualSortField === 'feedbackCount' || actualSortField === 'avgRating') {
      smallPipeline.push({
        $lookup: {
          from: 'feedbacks',
          let: { login: '$login' },
          pipeline: [
            { $match: { $expr: { $eq: ['$login', '$$login'] } } },
            { $project: { rating: 1 } }
          ],
          as: 'feedbackData'
        }
      });
      smallPipeline.push({
        $addFields: {
          feedbackCount: { $size: '$feedbackData' },
          avgRating: {
            $cond: {
              if: { $gt: [{ $size: '$feedbackData' }, 0] },
              then: {
                $avg: {
                  $map: {
                    input: '$feedbackData',
                    as: 'fb',
                    in: '$$fb.rating'
                  }
                }
              },
              else: null
            }
          },
          evoPerformance: {
            $cond: {
              if: { $gt: [{ $size: '$feedbackData' }, 0] },
              then: {
                $add: [
                  {
                    $multiply: [
                      {
                        $avg: {
                          $map: {
                            input: '$feedbackData',
                            as: 'fb',
                            in: '$$fb.rating'
                          }
                        }
                      },
                      10
                    ]
                  },
                  { $size: '$feedbackData' }
                ]
              },
              else: null
            }
          }
        }
      });
    }

    // Filter out students without feedback when sorting by feedback-related fields
    if (actualSortField === 'evoPerformance' || actualSortField === 'feedbackCount' || actualSortField === 'avgRating') {
      smallPipeline.push({
        $match: {
          feedbackCount: { $gt: 0 }
        }
      });
    }

    // Get total count before pagination (after filtering)
    const countPipeline = [...smallPipeline, { $count: 'total' }];
    const countResult = await Student.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Sort and paginate on small documents
    const sortStage: Record<string, 1 | -1> = {};
    sortStage[actualSortField as string] = sortOrder as 1 | -1;
    smallPipeline.push({ $sort: sortStage });
    smallPipeline.push({ $skip: skip });
    smallPipeline.push({ $limit: limitNum });
    smallPipeline.push({ $project: { login: 1, _id: 0 } });

    const sortedLogins = await Student.aggregate(smallPipeline);
    const loginList = sortedLogins.map((doc, index) => ({ login: doc.login, orderIndex: index }));

    if (loginList.length === 0) {
      return res.status(200).json({
        students: [],
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    }

    // PHASE 2: Detailed data fetch for selected logins only
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detailPipeline: any[] = [
      { $match: { login: { $in: loginList.map(l => l.login) } } },

      // Projects lookup with limited pipeline
      {
        $lookup: {
          from: 'projects',
          let: { login: '$login' },
          pipeline: [
            { $match: { $expr: { $eq: ['$login', '$$login'] } } },
            { $sort: { date: -1 } },
            { $limit: 10 },
            { $project: { project: 1, score: 1, status: 1, date: 1, _id: 0 } }
          ],
          as: 'projects'
        }
      },

      // Project stats lookup
      {
        $lookup: {
          from: 'projects',
          let: { login: '$login' },
          pipeline: [
            { $match: { $expr: { $eq: ['$login', '$$login'] } } },
            {
              $group: {
                _id: null,
                projectCount: {
                  $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
                },
                cheatCount: {
                  $sum: {
                    $cond: [
                      { $and: [{ $eq: ['$status', 'fail'] }, { $eq: ['$score', -42] }] },
                      1,
                      0
                    ]
                  }
                }
              }
            }
          ],
          as: 'projectStats'
        }
      },

      // Cheat projects lookup
      {
        $lookup: {
          from: 'projects',
          let: { login: '$login' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$login', '$$login'] },
                    { $eq: ['$status', 'fail'] },
                    { $eq: ['$score', -42] }
                  ]
                }
              }
            },
            { $sort: { date: -1 } },
            { $project: { project: 1, score: 1, status: 1, date: 1, _id: 0 } }
          ],
          as: 'cheatProjects'
        }
      },

      // Patronage lookup
      {
        $lookup: {
          from: 'patronages',
          let: { login: '$login' },
          pipeline: [
            { $match: { $expr: { $eq: ['$login', '$$login'] } } },
            {
              $project: {
                godfathers: 1,
                children: 1,
                godfatherCount: { $size: { $ifNull: ['$godfathers', []] } },
                childrenCount: { $size: { $ifNull: ['$children', []] } }
              }
            }
          ],
          as: 'patronageData'
        }
      },

      // LocationStats lookup
      {
        $lookup: {
          from: 'locationstats',
          let: { login: '$login' },
          pipeline: [
            { $match: { $expr: { $eq: ['$login', '$$login'] } } },
            { $project: { months: 1 } }
          ],
          as: 'locationData'
        }
      },

      // Feedback lookup with limited fields
      {
        $lookup: {
          from: 'feedbacks',
          let: { login: '$login' },
          pipeline: [
            { $match: { $expr: { $eq: ['$login', '$$login'] } } },
            { $project: { rating: 1, ratingDetails: 1 } }
          ],
          as: 'feedbackData'
        }
      },

      // Calculate all fields
      {
        $addFields: {
          project_count: { $ifNull: [{ $arrayElemAt: ['$projectStats.projectCount', 0] }, 0] },
          cheat_count: { $ifNull: [{ $arrayElemAt: ['$projectStats.cheatCount', 0] }, 0] },
          has_cheats: { $gt: [{ $ifNull: [{ $arrayElemAt: ['$projectStats.cheatCount', 0] }, 0] }, 0] },
          
          patronage: { $arrayElemAt: ['$patronageData', 0] },
          godfather_count: { $ifNull: [{ $arrayElemAt: ['$patronageData.godfatherCount', 0] }, 0] },
          children_count: { $ifNull: [{ $arrayElemAt: ['$patronageData.childrenCount', 0] }, 0] },
          
          logTime: {
            $reduce: {
              input: { $objectToArray: { $ifNull: [{ $arrayElemAt: ['$locationData.months', 0] }, {}] } },
              initialValue: 0,
              in: {
                $add: [
                  '$$value',
                  {
                    $let: {
                      vars: {
                        timeParts: { $split: [{ $ifNull: ['$$this.v.totalDuration', '00:00:00'] }, ':'] }
                      },
                      in: {
                        $add: [
                          { $multiply: [{ $toInt: { $arrayElemAt: ['$$timeParts', 0] } }, 3600] },
                          { $multiply: [{ $toInt: { $arrayElemAt: ['$$timeParts', 1] } }, 60] },
                          { $toInt: { $arrayElemAt: ['$$timeParts', 2] } }
                        ]
                      }
                    }
                  }
                ]
              }
            }
          },
          
          feedbackCount: { $size: '$feedbackData' },
          avgRating: {
            $cond: {
              if: { $gt: [{ $size: '$feedbackData' }, 0] },
              then: {
                $avg: {
                  $map: {
                    input: '$feedbackData',
                    as: 'fb',
                    in: '$$fb.rating'
                  }
                }
              },
              else: '$$REMOVE'
            }
          },
          avgRatingDetails: {
            $cond: {
              if: { $gt: [{ $size: '$feedbackData' }, 0] },
              then: {
                nice: {
                  $avg: {
                    $map: {
                      input: '$feedbackData',
                      as: 'fb',
                      in: '$$fb.ratingDetails.nice'
                    }
                  }
                },
                rigorous: {
                  $avg: {
                    $map: {
                      input: '$feedbackData',
                      as: 'fb',
                      in: '$$fb.ratingDetails.rigorous'
                    }
                  }
                },
                interested: {
                  $avg: {
                    $map: {
                      input: '$feedbackData',
                      as: 'fb',
                      in: '$$fb.ratingDetails.interested'
                    }
                  }
                },
                punctuality: {
                  $avg: {
                    $map: {
                      input: '$feedbackData',
                      as: 'fb',
                      in: '$$fb.ratingDetails.punctuality'
                    }
                  }
                }
              },
              else: '$$REMOVE'
            }
          },
          evoPerformance: {
            $cond: {
              if: { $gt: [{ $size: '$feedbackData' }, 0] },
              then: {
                $add: [
                  {
                    $multiply: [
                      {
                        $avg: {
                          $map: {
                            input: '$feedbackData',
                            as: 'fb',
                            in: '$$fb.rating'
                          }
                        }
                      },
                      10
                    ]
                  },
                  { $size: '$feedbackData' }
                ]
              },
              else: '$$REMOVE'
            }
          }
        }
      },

      // Clean up temporary fields
      {
        $project: {
          __v: 0,
          projectStats: 0,
          patronageData: 0,
          locationData: 0,
          feedbackData: 0
          // cheatProjects kalacak - silinmeyecek
        }
      }
    ];

    const students = await Student.aggregate(detailPipeline);

    // Re-sort according to phase 1 order
    const loginOrderMap = new Map(loginList.map(l => [l.login, l.orderIndex]));
    students.sort((a, b) => {
      const orderA = loginOrderMap.get(a.login) ?? 999999;
      const orderB = loginOrderMap.get(b.login) ?? 999999;
      return orderA - orderB;
    });

    return res.status(200).json({
      students,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

