import type { VercelRequest } from '@vercel/node';
import { getEventLogModel } from '../models/EventLog';

/**
 * Log API requests to EventLog (DB2)
 */
export async function logEvent(
    req: VercelRequest,
    login: string,
    campusId: number,
    eventType: string,
    eventData: Record<string, unknown> = {}
): Promise<void> {
    try {
        const EventLog = getEventLogModel();

        // Get client IP
        const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            || (req.headers['x-real-ip'] as string)
            || 'unknown';

        // Get user agent
        const userAgent = (req.headers['user-agent'] as string) || 'unknown';

        await EventLog.create({
            login,
            campusId,
            eventType,
            eventData,
            ip: clientIp,
            userAgent,
            method: req.method,
            path: req.url,
            timestamp: new Date()
        });
    } catch (error) {
        // Silent fail - don't break the main request if logging fails
        console.error('EventLog error:', error instanceof Error ? error.message : 'Unknown error');
    }
}

/**
 * Simplified logEvent for non-request contexts
 */
export async function logEventSimple(
    login: string,
    campusId: number,
    eventType: string,
    eventData: Record<string, unknown> = {}
): Promise<void> {
    try {
        const EventLog = getEventLogModel();

        await EventLog.create({
            login,
            campusId,
            eventType,
            eventData,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('EventLog error:', error instanceof Error ? error.message : 'Unknown error');
    }
}
