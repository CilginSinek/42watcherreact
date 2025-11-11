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

  // Authorization kontrolü
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

  try {
    await connectDB();

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

    // Search filter
    if (search && typeof search === 'string') {
      matchFilter.$or = [
        { login: { $regex: search, $options: 'i' } },
        { displayname: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
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
      'avg_rating': 'avgRating'
    };

    const actualSortField = sortFieldMap[sortBy as string] || sortBy;

    // OPTIMIZED AGGREGATION PIPELINE - Tüm işlemler MongoDB'de
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipeline: any[] = [
      // 1. İlk filtreleme
      { $match: matchFilter },

      // 2. Projects lookup ve hesaplama
      {
        $lookup: {
          from: 'projects',
          localField: 'login',
          foreignField: 'login',
          as: 'projectsData'
        }
      },
      {
        $addFields: {
          // Success project count
          projectCount: {
            $size: {
              $filter: {
                input: '$projectsData',
                as: 'proj',
                cond: { $eq: ['$$proj.status', 'success'] }
              }
            }
          },
          // Cheat count
          cheatCount: {
            $size: {
              $filter: {
                input: '$projectsData',
                as: 'proj',
                cond: {
                  $and: [
                    { $eq: ['$$proj.status', 'fail'] },
                    { $eq: ['$$proj.score', -42] }
                  ]
                }
              }
            }
          },
          // Has cheats flag
          has_cheats: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: '$projectsData',
                    as: 'proj',
                    cond: {
                      $and: [
                        { $eq: ['$$proj.status', 'fail'] },
                        { $eq: ['$$proj.score', -42] }
                      ]
                    }
                  }
                }
              },
              0
            ]
          }
        }
      },

      // 3. Patronage lookup
      {
        $lookup: {
          from: 'patronages',
          localField: 'login',
          foreignField: 'login',
          as: 'patronageData'
        }
      },
      {
        $addFields: {
          patronage: { $arrayElemAt: ['$patronageData', 0] },
          godfatherCount: {
            $size: {
              $ifNull: [
                { $arrayElemAt: ['$patronageData.godfathers', 0] },
                []
              ]
            }
          },
          childrenCount: {
            $size: {
              $ifNull: [
                { $arrayElemAt: ['$patronageData.children', 0] },
                []
              ]
            }
          }
        }
      },

      // 4. LocationStats lookup ve duration hesaplama
      {
        $lookup: {
          from: 'locationstats',
          localField: 'login',
          foreignField: 'login',
          as: 'locationData'
        }
      },
      {
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
      },

      // 5. Feedback lookup ve evaluation metrics hesaplama
      {
        $lookup: {
          from: 'feedbacks',
          localField: 'login',
          foreignField: 'login',
          as: 'feedbackData'
        }
      },
      {
        $addFields: {
          // Feedback count
          feedbackCount: { $size: '$feedbackData' },
          // Average rating
          avgRating: {
            $cond: {
              if: { $gt: [{ $size: '$feedbackData' }, 0] },
              then: { $avg: '$feedbackData.rating' },
              else: 0
            }
          },
          // Average rating details
          avgRatingDetails: {
            nice: {
              $cond: {
                if: { $gt: [{ $size: '$feedbackData' }, 0] },
                then: { $avg: '$feedbackData.ratingDetails.nice' },
                else: 0
              }
            },
            rigorous: {
              $cond: {
                if: { $gt: [{ $size: '$feedbackData' }, 0] },
                then: { $avg: '$feedbackData.ratingDetails.rigorous' },
                else: 0
              }
            },
            interested: {
              $cond: {
                if: { $gt: [{ $size: '$feedbackData' }, 0] },
                then: { $avg: '$feedbackData.ratingDetails.interested' },
                else: 0
              }
            },
            punctuality: {
              $cond: {
                if: { $gt: [{ $size: '$feedbackData' }, 0] },
                then: { $avg: '$feedbackData.ratingDetails.punctuality' },
                else: 0
              }
            }
          },
          // Evo performance score (weighted: feedback count + average rating)
          evoPerformance: {
            $cond: {
              if: { $gt: [{ $size: '$feedbackData' }, 0] },
              then: {
                $add: [
                  { $multiply: [{ $avg: '$feedbackData.rating' }, 10] }, // Rating weight
                  { $size: '$feedbackData' } // Feedback count
                ]
              },
              else: 0
            }
          }
        }
      },

      // 6. Son 10 projeyi ekle ve gereksiz alanları kaldır
      {
        $addFields: {
          projects: {
            $slice: [
              {
                $sortArray: {
                  input: {
                    $map: {
                      input: '$projectsData',
                      as: 'proj',
                      in: {
                        project: '$$proj.project',
                        score: '$$proj.score',
                        status: '$$proj.status',
                        date: '$$proj.date'
                      }
                    }
                  },
                  sortBy: { date: -1 }
                }
              },
              10
            ]
          }
        }
      },
      {
        $project: {
          __v: 0,
          projectsData: 0,
          patronageData: 0,
          locationData: 0,
          feedbackData: 0
        }
      }
    ];

    // 7. Sıralama ekle
    const sortStage: Record<string, 1 | -1> = {};
    sortStage[actualSortField as string] = sortOrder as 1 | -1;
    pipeline.push({ $sort: sortStage });

    // 8. Facet ile pagination ve count
    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        students: [
          { $skip: skip },
          { $limit: limitNum }
        ]
      }
    });

    const result = await Student.aggregate(pipeline);

    const students = result[0].students || [];
    const total = result[0].metadata[0]?.total || 0;

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

