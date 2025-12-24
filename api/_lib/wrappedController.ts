interface StudentData {
    pool_year?: string;
    login?: string;
    displayname?: string;
    image?: unknown;
}

interface ProjectData {
    project?: string;
    date?: string;
    status?: string;
    score?: number;
}

interface ReviewData {
    project?: string;
    evaluated?: string;
    evaluator?: string;
    date?: string;
    comment?: string;
}

interface FeedbackData {
    evaluated?: string;
    evaluator?: string;
    date?: string;
    comment?: string;
}

interface PatronageData {
    godfathers?: Array<{ login: string }>;
    children?: Array<{ login: string }>;
}

interface WrappedInput {
    student: StudentData;
    projects?: ProjectData[];
    projectReviews?: ReviewData[];
    feedbacks?: FeedbackData[];
    projectReviewsReceived?: ReviewData[];
    feedbacksReceived?: FeedbackData[];
    patronage?: PatronageData | null;
    projectReviewsForWords?: Array<{ comment?: string }>;
    feedbacksForWords?: Array<{ comment?: string }>;
}

/**
 * Generate 2025 wrapped summary for a user
 */
export function generateWrappedSummary(data: WrappedInput) {
    const {
        student,
        projects = [],
        projectReviews = [],
        feedbacks = [],
        projectReviewsReceived = [],
        feedbacksReceived = [],
        patronage = null,
        projectReviewsForWords = [],
        feedbacksForWords = [],
    } = data;

    const summary: { headline?: string; shortDescription?: string } = {};
    const highlights: Record<string, unknown> = {};
    const stats: Record<string, number> = {};
    const labels: string[] = [];
    const fallbackNotes: string[] = [];

    // Helper: Extract words from text
    const extractWords = (texts: string[]): Record<string, number> => {
        const wordMap: Record<string, number> = {};
        texts.forEach(text => {
            if (!text) return;
            const words = text.toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 3);
            words.forEach(word => {
                wordMap[word] = (wordMap[word] || 0) + 1;
            });
        });
        return wordMap;
    };

    // Helper: Parse project name and retry count
    const parseProjectName = (projectName: string | undefined): { name: string; retryCount: number } => {
        if (!projectName) return { name: '', retryCount: 0 };
        const match = projectName.match(/^(.+?)#(\d+)$/);
        if (match) {
            return { name: match[1], retryCount: parseInt(match[2], 10) };
        }
        return { name: projectName, retryCount: 0 };
    };

    // Analyze projects
    const projectAttempts: Record<string, number> = {};
    let maxRetryCount = 0;
    let maxRetryProject: string | null = null;

    projects.forEach(p => {
        const { name, retryCount } = parseProjectName(p.project);

        projectAttempts[name] = (projectAttempts[name] || 0) + 1;

        if (retryCount > maxRetryCount) {
            maxRetryCount = retryCount;
            maxRetryProject = name;
        }
    });

    const mostAttemptedProject = Object.entries(projectAttempts)
        .sort((a, b) => b[1] - a[1])[0];

    // Combine attempts count with retry number for most attempted project
    if (mostAttemptedProject && (mostAttemptedProject[1] > 1 || maxRetryCount > 0)) {
        const projectName = mostAttemptedProject ? mostAttemptedProject[0] : maxRetryProject;
        const attempts = mostAttemptedProject ? mostAttemptedProject[1] : 0;
        const retries = maxRetryProject === projectName ? maxRetryCount : 0;

        highlights.mostAttemptedProject = {
            name: projectName,
            attempts: Math.max(attempts, retries + 1),
            retries: retries
        };
    }

    // Analyze project reviews (as reviewer)
    const reviewedProjects: Record<string, number> = {};
    const reviewedUsersGiven: Record<string, number> = {};
    const reviewedUsersReceived: Record<string, number> = {};

    projectReviews.forEach(pr => {
        if (pr.project) {
            reviewedProjects[pr.project] = (reviewedProjects[pr.project] || 0) + 1;
        }
        if (pr.evaluated) {
            reviewedUsersGiven[pr.evaluated] = (reviewedUsersGiven[pr.evaluated] || 0) + 1;
        }
    });

    projectReviewsReceived.forEach(pr => {
        if (pr.evaluator) {
            reviewedUsersReceived[pr.evaluator] = (reviewedUsersReceived[pr.evaluator] || 0) + 1;
        }
    });

    const mostReviewedProject = Object.entries(reviewedProjects)
        .sort((a, b) => b[1] - a[1])[0];

    if (mostReviewedProject) {
        highlights.mostReviewedProject = {
            name: mostReviewedProject[0],
            count: mostReviewedProject[1]
        };
    }

    // Analyze feedbacks
    const feedbackUsersGiven: Record<string, number> = {};
    const feedbackUsersReceived: Record<string, number> = {};

    feedbacks.forEach(fb => {
        if (fb.evaluated) {
            feedbackUsersGiven[fb.evaluated] = (feedbackUsersGiven[fb.evaluated] || 0) + 1;
        }
    });

    feedbacksReceived.forEach(fb => {
        if (fb.evaluator) {
            feedbackUsersReceived[fb.evaluator] = (feedbackUsersReceived[fb.evaluator] || 0) + 1;
        }
    });

    // Combined: Most given (review + feedback)
    const combinedGiven: Record<string, number> = {};
    Object.entries(reviewedUsersGiven).forEach(([login, count]) => {
        combinedGiven[login] = (combinedGiven[login] || 0) + count;
    });
    Object.entries(feedbackUsersGiven).forEach(([login, count]) => {
        combinedGiven[login] = (combinedGiven[login] || 0) + count;
    });

    const mostInteractedUserGiven = Object.entries(combinedGiven)
        .sort((a, b) => b[1] - a[1])[0];

    if (mostInteractedUserGiven) {
        const reviewCount = reviewedUsersGiven[mostInteractedUserGiven[0]] || 0;
        const feedbackCount = feedbackUsersGiven[mostInteractedUserGiven[0]] || 0;

        highlights.mostEvaluatedUser = {
            login: mostInteractedUserGiven[0],
            totalCount: mostInteractedUserGiven[1],
            reviewCount,
            feedbackCount
        };
    }

    // Combined: Most received (review + feedback)
    const combinedReceived: Record<string, number> = {};
    Object.entries(reviewedUsersReceived).forEach(([login, count]) => {
        combinedReceived[login] = (combinedReceived[login] || 0) + count;
    });
    Object.entries(feedbackUsersReceived).forEach(([login, count]) => {
        combinedReceived[login] = (combinedReceived[login] || 0) + count;
    });

    const mostInteractedUserReceived = Object.entries(combinedReceived)
        .sort((a, b) => b[1] - a[1])[0];

    if (mostInteractedUserReceived) {
        const reviewCount = reviewedUsersReceived[mostInteractedUserReceived[0]] || 0;
        const feedbackCount = feedbackUsersReceived[mostInteractedUserReceived[0]] || 0;

        highlights.mostEvaluatorUser = {
            login: mostInteractedUserReceived[0],
            totalCount: mostInteractedUserReceived[1],
            reviewCount,
            feedbackCount
        };
    }

    // Most used words
    const allTexts = [
        ...projectReviewsForWords.map(pr => pr.comment).filter(Boolean) as string[],
        ...feedbacksForWords.map(fb => fb.comment).filter(Boolean) as string[]
    ];

    const wordFrequency = extractWords(allTexts);
    const topWords = Object.entries(wordFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    if (topWords.length > 0) {
        highlights.mostUsedWords = topWords.map(([word, count]) => ({ word, count }));
    }

    // Activity analysis
    const allActivityDates = [
        ...projects.map(p => ({ date: p.date, type: 'project' })).filter(a => a.date),
        ...projectReviews.map(pr => ({ date: pr.date, type: 'review' })).filter(a => a.date),
        ...feedbacks.map(fb => ({ date: fb.date, type: 'feedback' })).filter(a => a.date)
    ];

    // Find most active week
    const weekActivity: Record<string, { total: number; projects: number; reviews: number; feedbacks: number }> = {};
    allActivityDates.forEach(activity => {
        const date = new Date(activity.date!);
        if (isNaN(date.getTime())) return;
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];

        if (!weekActivity[weekKey]) {
            weekActivity[weekKey] = { total: 0, projects: 0, reviews: 0, feedbacks: 0 };
        }
        weekActivity[weekKey].total++;
        if (activity.type === 'project') weekActivity[weekKey].projects++;
        if (activity.type === 'review') weekActivity[weekKey].reviews++;
        if (activity.type === 'feedback') weekActivity[weekKey].feedbacks++;
    });

    const mostActiveWeek = Object.entries(weekActivity)
        .sort((a, b) => b[1].total - a[1].total)[0];

    if (mostActiveWeek) {
        highlights.mostActiveWeek = {
            week: mostActiveWeek[0],
            total: mostActiveWeek[1].total,
            projects: mostActiveWeek[1].projects,
            reviews: mostActiveWeek[1].reviews,
            feedbacks: mostActiveWeek[1].feedbacks
        };
    }

    // Find quietest period
    const allDates = allActivityDates.map(a => new Date(a.date!));

    // Find first libft project date
    const libftProjects = projects.filter(p => {
        const { name } = parseProjectName(p.project);
        return name.toLowerCase().includes('libft');
    });

    let startDate: Date | null = null;
    if (libftProjects.length > 0) {
        const libftDates = libftProjects.map(p => new Date(p.date!)).filter(d => !isNaN(d.getTime()));
        if (libftDates.length > 0) {
            startDate = new Date(Math.min(...libftDates.map(d => d.getTime())));
        }
    }

    if (!startDate && allDates.length > 0) {
        startDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    }

    if (startDate && allDates.length > 1) {
        const filteredDates = allDates.filter(d => d >= startDate!).sort((a, b) => a.getTime() - b.getTime());
        let longestGap = 0;
        let gapStart: Date | null = null;

        for (let i = 1; i < filteredDates.length; i++) {
            const gap = (filteredDates[i].getTime() - filteredDates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
            if (gap > longestGap) {
                longestGap = gap;
                gapStart = filteredDates[i - 1];
            }
        }

        if (longestGap > 7) {
            highlights.quietestPeriod = {
                days: Math.floor(longestGap),
                startDate: gapStart?.toISOString().split('T')[0]
            };
        }
    }

    // Stats summary
    stats.totalProjects = projects.length;
    stats.totalReviews = projectReviews.length;
    stats.totalFeedbacks = feedbacks.length;
    stats.passedProjects = projects.filter(p => (p.status === 'finished' || p.status === 'success') && (p.score || 0) > 0).length;
    stats.avgProjectScore = projects.length > 0
        ? Math.round(projects.reduce((sum, p) => sum + (p.score || 0), 0) / projects.length)
        : 0;

    // Patronage stats
    if (patronage) {
        stats.godfathers = patronage.godfathers?.length || 0;
        stats.children = patronage.children?.length || 0;
    }

    // Generate labels
    const hasLowActivity = stats.totalProjects < 5;
    const hasRepeatedAttempts = mostAttemptedProject && mostAttemptedProject[1] >= 5;
    const hasMoreFeedbackThanProjects = stats.totalFeedbacks > stats.totalProjects && stats.totalProjects < 10;
    const hasMentorRole = (stats.children || 0) > 2;

    // Check if user went back to a project after success
    const projectSuccessMap: Record<string, Array<{ date: Date; status?: string; score?: number }>> = {};
    projects.forEach(p => {
        const { name } = parseProjectName(p.project);
        if (!projectSuccessMap[name]) {
            projectSuccessMap[name] = [];
        }
        projectSuccessMap[name].push({
            date: new Date(p.date!),
            status: p.status,
            score: p.score
        });
    });

    let hasReturnedAfterSuccess = false;
    Object.values(projectSuccessMap).forEach(attempts => {
        attempts.sort((a, b) => a.date.getTime() - b.date.getTime());
        let hadSuccess = false;
        for (const attempt of attempts) {
            if (hadSuccess && (attempt.status === 'success' || attempt.status === 'finished') && (attempt.score || 0) > 0) {
                hasReturnedAfterSuccess = true;
                break;
            }
            if ((attempt.status === 'success' || attempt.status === 'finished') && (attempt.score || 0) > 0) {
                hadSuccess = true;
            }
        }
    });

    // Check success rate
    const totalAttempts = projects.length;
    const successfulProjects = projects.filter(p => (p.status === 'success' || p.status === 'finished') && (p.score || 0) > 0).length;
    const successRate = totalAttempts > 0 ? (successfulProjects / totalAttempts) * 100 : 0;
    const hasHighSuccessRate = successRate >= 80 && totalAttempts >= 5;

    if (hasRepeatedAttempts) {
        labels.push("Vazgeçmeyen");
    }

    if (hasMoreFeedbackThanProjects) {
        labels.push("Sessiz ama derin");
    }

    if (hasMentorRole) {
        labels.push("Mentor ruhlu");
    }

    if (hasReturnedAfterSuccess) {
        labels.push("Geri dönen");
    }

    if (hasHighSuccessRate) {
        labels.push("Kendinden emin");
    }

    if (hasLowActivity) {
        labels.push("Yeni başlayan");
        fallbackNotes.push("Bu sene temeller atıldı");
        fallbackNotes.push("Yolun başı ama yön belli");
    }

    if (stats.totalReviews > 200) {
        labels.push("Topluluk destekçisi");
    }

    if (labels.length === 0) {
        const isNewStudent = student?.pool_year === '2025';
        labels.push(isNewStudent ? "Keşif aşamasında" : "Dönüş yılı");
    }

    // Limit to 4 labels
    labels.splice(4);

    // Generate summary
    const totalActivity = stats.totalProjects + stats.totalReviews;
    const isNewStudent = student?.pool_year === '2025';

    if (totalActivity > 200) {
        summary.headline = "Yoğun bir yıl geçirdin!";
        summary.shortDescription = `${stats.totalProjects} proje teslim, ${stats.totalReviews} review ve ${stats.totalFeedbacks} feedback ile dolu bir 2025.`;
    } else if (totalActivity > 110) {
        summary.headline = "Güzel bir ilerleme kaydedildi";
        summary.shortDescription = `2025'te ${stats.totalProjects} projeye giriş yapıldı ve toplulukla ${stats.totalReviews + stats.totalFeedbacks} etkileşim gerçekleştirildi.`;
    } else if (totalActivity > 50) {
        summary.headline = "Başlangıçlar yapıldı";
        summary.shortDescription = `İlk adımlar atıldı. ${stats.totalProjects} proje deneyimi ve ${stats.totalReviews + stats.totalFeedbacks} topluluk etkileşimi.`;
    } else {
        if (isNewStudent) {
            summary.headline = "Keşif yılı";
            summary.shortDescription = "2025 yolculuğun başlangıcı oldu. Her büyük hikaye bir adımla başlar.";
        } else {
            summary.headline = "Ara yıl";
            summary.shortDescription = "2025'te yavaş bir tempo. Bazen durup nefes almak da gerekir.";
        }
        if (fallbackNotes.length === 0) {
            if (isNewStudent) {
                fallbackNotes.push("Yeni başlangıçlar heyecan verici");
                fallbackNotes.push("İlk adımlar en değerlileri");
            } else {
                fallbackNotes.push("Her hız farklı bir ritim gerektirir");
                fallbackNotes.push("Geri dönüş her zaman mümkün");
            }
        }
    }

    return {
        summary,
        highlights,
        stats,
        labels,
        fallbackNotes
    };
}
