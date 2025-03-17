import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { RequestHeaders } from '../../Types/model';
import fetch from 'node-fetch';
import { ENV } from '../../config/environment';

export interface UserPayload {
    id: string;
    email: string;
}

// Type guard for checking if JWT_SECRET exists
function ensureJwtSecret(secret: string | undefined): string {
    if (!secret) {
        throw new Error('JWT_SECRET is not defined');
    }
    return secret;
}

declare global {
    namespace Express {
        interface Request {
            user?: UserPayload;
        }
    }
}

// Helper function to check if a request is a Google Pub/Sub webhook notification
export function isGooglePubSubNotification(req: Request): boolean {
    return Boolean(
        req.body && 
        req.body.message && 
        req.body.subscription && 
        req.body.subscription.includes('projects/eliza-replit/subscriptions/')
    );
}

// List of allowed domains for Pub/Sub notifications
export const ALLOWED_PUBSUB_DOMAINS = [
    'pubsub.googleapis.com',
    'gmail.googleapis.com',
    'ngrok-free.app', // Allow ngrok domains for development
    'localhost'       // Allow localhost for local testing
];

// Helper function to validate if the request is from an allowed domain
export function isFromAllowedPubSubDomain(req: Request): boolean {
    const pubsubDomain = req.get('x-forwarded-host') || req.hostname;
    return ALLOWED_PUBSUB_DOMAINS.some(domain => pubsubDomain.includes(domain));
}

// Verify a Supabase JWT token
async function verifySupabaseToken(token: string): Promise<UserPayload | null> {
    try {
        // For security, we'll use Supabase's Admin API to verify the token
        // This avoids having to decode the JWT ourselves
        const response = await fetch(`${ENV.SUPABASE_URL}/auth/v1/user`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': ENV.SUPABASE_SERVICE_ROLE_KEY || ''
            }
        });

        if (!response.ok) {
            return null;
        }

        const userData = await response.json();
        
        if (userData && userData.id) {
            return {
                id: userData.id,
                email: userData.email || ''
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error verifying Supabase token:', error);
        return null;
    }
}

const auth = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    // Skip authentication for Google Pub/Sub webhook notifications
    if (isGooglePubSubNotification(req)) {
        // Optionally validate the domain
        if (!isFromAllowedPubSubDomain(req)) {
            console.warn("🔔 AUTH: Suspicious domain for Pub/Sub notification:", req.get('x-forwarded-host') || req.hostname);
            return res.status(403).json({ error: 'Forbidden' });
        }
        
        console.log("🔔 AUTH: Detected Google Pub/Sub notification, bypassing authentication");
        return next();
    }

    const authHeader = req.header(RequestHeaders.AUTH_HEADER);

    if (!authHeader) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    // Extract token from Bearer format if present
    const token = authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : authHeader;

    try {
        // First try to verify with Supabase
        const supabaseUser = await verifySupabaseToken(token);
        
        if (supabaseUser) {
            // Supabase authentication successful
            req.user = supabaseUser;
            return next();
        }
        
        // Fallback to legacy JWT verification
        const jwtSecret = ensureJwtSecret(process.env.JWT_SECRET);
        
        jwt.verify(token, jwtSecret, (error, decoded) => {
            if (error) {
                return res.status(401).json({ msg: 'Token has either expired or is not valid! Redirect to Login/Sign up page' });
            } else {
                // Directly use the decoded token fields
                req.user = {
                    id: (decoded as any).id,
                    email: (decoded as any).email,
                };
                next();
            }
        });
    } catch (err) {
        console.error('something wrong with auth middleware', err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

export default auth;