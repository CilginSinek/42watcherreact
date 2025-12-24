/**
 * Input validation and sanitization utilities
 */

/**
 * Validate and sanitize campusId
 */
export function validateCampusId(campusId: string | undefined): number | null {
    if (!campusId || campusId === 'all') {
        return null;
    }

    const parsed = parseInt(campusId, 10);

    if (isNaN(parsed) || parsed < 0 || parsed > 999999) {
        throw new Error('Invalid campusId: must be a positive integer');
    }

    return parsed;
}

/**
 * Validate and sanitize login parameter
 */
export function validateLogin(login: string | undefined): string {
    if (!login || typeof login !== 'string') {
        throw new Error('Invalid login: must be a non-empty string');
    }

    const loginRegex = /^[a-zA-Z0-9_-]{1,50}$/;

    if (!loginRegex.test(login)) {
        throw new Error('Invalid login format: only alphanumeric, hyphens, and underscores allowed');
    }

    return login.trim();
}

/**
 * Validate and sanitize search query
 */
export function validateSearch(search: string | undefined): string {
    if (!search || typeof search !== 'string') {
        return '';
    }

    const sanitized = search.replace(/[^a-zA-Z0-9\s._-]/g, '');
    return sanitized.trim().substring(0, 100);
}

/**
 * Validate pool format
 */
export function validatePool(year: string | undefined, month: string | undefined): { month: string; year: string } | null {
    if ((!month || month === '') && (!year || year === '')) {
        return null;
    }

    if (!month || typeof month !== 'string') {
        throw new Error('Invalid pool month: must be a non-empty string');
    }

    if (!year || typeof year !== 'string') {
        throw new Error('Invalid pool year: must be a non-empty string');
    }

    const validMonths = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
    ];

    const monthLower = month.toLowerCase();
    if (!validMonths.includes(monthLower) && !/^\d{1,2}$/.test(month)) {
        throw new Error('Invalid pool month');
    }

    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
        throw new Error('Invalid pool year: must be between 2000-2100');
    }

    return { month: monthLower, year: year };
}

/**
 * Validate grade
 */
export function validateGrade(grade: string | undefined): string | null {
    if (!grade || typeof grade !== 'string') {
        return null;
    }

    const sanitized = grade.replace(/[^a-zA-Z\s]/g, '').trim();

    if (sanitized.length > 50) {
        throw new Error('Invalid grade: too long');
    }

    return sanitized;
}

/**
 * Validate sort field
 */
export function validateSort(sort: string | undefined): string {
    const allowedFields = [
        'login', 'level', 'wallet', 'correction_point',
        'first_name', 'last_name', 'displayname', 'pool_month', 'pool_year',
        'project_count', 'cheat_count', 'cheat_date', 'godfather_count', 'children_count',
        'log_time', 'evo_performance', 'feedback_count', 'avg_rating'
    ];

    if (!sort || !allowedFields.includes(sort)) {
        return 'login';
    }

    return sort;
}

/**
 * Validate sort order
 */
export function validateOrder(order: string | undefined): 'asc' | 'desc' {
    if (order !== 'asc' && order !== 'desc') {
        return 'asc';
    }

    return order;
}

/**
 * Validate pagination limit
 */
export function validateLimit(limit: string | number | undefined): number {
    const parsed = parseInt(String(limit), 10);

    if (isNaN(parsed) || parsed < 1) {
        return 50;
    }

    if (parsed > 500) {
        return 500;
    }

    return parsed;
}

/**
 * Validate pagination skip/offset
 */
export function validateSkip(skip: string | number | undefined): number {
    const parsed = parseInt(String(skip), 10);

    if (isNaN(parsed) || parsed < 0) {
        return 0;
    }

    if (parsed > 100000) {
        throw new Error('Invalid skip: maximum offset exceeded');
    }

    return parsed;
}

/**
 * Validate status filter
 */
export function validateStatus(status: string | undefined): string | null {
    if (!status || status === 'all') {
        return null;
    }

    const validStatuses = [
        'active', 'alumni', 'staff', 'blackholed', 'transcender',
        'cadet', 'piscine', 'sinker', 'freeze', 'inactive', 'test'
    ];

    if (!validStatuses.includes(status)) {
        throw new Error('Invalid status filter');
    }

    return status;
}

/**
 * Validate active status
 */
export function validateActive(active: string | undefined): boolean | null {
    if (!active) {
        return null;
    }

    if (active === 'true') {
        return true;
    }

    if (active === 'false') {
        return false;
    }

    throw new Error('Invalid active status: must be "true" or "false"');
}
