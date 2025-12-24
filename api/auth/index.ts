import type { VercelRequest, VercelResponse } from '@vercel/node';
import connectDB from '../lib/mongodb';
import { getSessionModel } from '../models/Session';
import { encryptToken, generateSessionToken } from '../lib/crypto';

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        await connectDB();
        const Session = getSessionModel();

        // Route based on action parameter
        const action = req.query.action as string || req.body?.action;

        // LOGOUT ACTION
        if (action === 'logout') {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'No session token provided' });
            }

            const sessionToken = authHeader.replace('Bearer ', '');
            const session = await Session.findOneAndDelete({ sessionToken });

            if (!session) {
                return res.status(404).json({ error: 'Session not found' });
            }

            return res.status(200).json({ message: 'Logged out successfully' });
        }

        // CALLBACK ACTION (default - OAuth callback)
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Authorization code is required' });
        }

        const response = await fetch('https://api.intra.42.fr/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                client_id: process.env.FORTYTWO_CLIENT_ID,
                client_secret: process.env.FORTYTWO_CLIENT_SECRET,
                code: code,
                redirect_uri: process.env.FORTYTWO_REDIRECT_URI,
            }),
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tokenData = await response.json() as any;

        if (!response.ok) {
            console.error('42 API Error:', tokenData);
            return res.status(response.status).json({
                error: 'Failed to exchange code for token',
                details: tokenData
            });
        }

        // Fetch user data from 42 API
        const userResponse = await fetch('https://api.intra.42.fr/v2/me', {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
            },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userData = await userResponse.json() as any;

        if (!userResponse.ok) {
            console.error('Failed to fetch user data:', userData);
            return res.status(userResponse.status).json({
                error: 'Failed to fetch user data',
                details: userData
            });
        }

        // Get client IP
        const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
            (req.headers['x-real-ip'] as string) ||
            'unknown';

        // Generate session token
        const sessionToken = generateSessionToken();

        // Encrypt the access token
        const encryptedAccessToken = encryptToken(tokenData.access_token);

        // Create session with 30 days expiry
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const session = await Session.create({
            sessionToken,
            login: userData.login,
            campusId: userData.campus_users?.[0]?.campus_id || 0,
            userData: {
                ...userData,
                encryptedAccessToken,
                tokenType: tokenData.token_type,
                expiresIn: tokenData.expires_in,
                refreshToken: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : undefined,
            },
            usedIps: [clientIp],
            lastActivity: new Date(),
            expiresAt,
        });

        return res.status(200).json({
            sessionToken: session.sessionToken,
            user: {
                id: userData.id,
                login: userData.login,
                displayname: userData.displayname,
                email: userData.email,
                image: userData.image,
                campus: userData.campus_users?.[0],
            },
            expiresAt: session.expiresAt,
        });
    } catch (error) {
        console.error('Auth error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
