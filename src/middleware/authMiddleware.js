import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;

export const verifySupabaseToken = async (token) => {
    try {
        if (!token) {
            return { valid: false, error: 'No token provided' };
        }

        if (!supabaseJwtSecret) {
            console.warn('⚠️  SUPABASE_JWT_SECRET not configured. Skipping auth validation.');
            return { valid: true, user: null };
        }

        const decoded = jwt.verify(token, supabaseJwtSecret);
        
        return {
            valid: true,
            user: {
                id: decoded.sub,
                email: decoded.email,
                role: decoded.role,
            },
        };
    } catch (error) {
        return {
            valid: false,
            error: error.message,
        };
    }
};

export const socketAuthMiddleware = async (socket, next) => {
    try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        
        if (!supabaseJwtSecret) {
            return next();
        }

        if (!token) {
            socket.authenticated = false;
            socket.user = null;
            return next();
        }

        const result = await verifySupabaseToken(token);
        
        if (result.valid) {
            socket.authenticated = true;
            socket.user = result.user;
            console.log(`✅ Authenticated user: ${result.user?.email || 'anonymous'}`);
        } else {
            socket.authenticated = false;
            socket.user = null;
            console.log(`⚠️  Invalid token: ${result.error}`);
        }

        next();
    } catch (error) {
        console.error('❌ Auth middleware error:', error);
        socket.authenticated = false;
        socket.user = null;
        next();
    }
};
