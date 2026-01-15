import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;

// Lazy initialization of Supabase client to ensure env vars are loaded
function getSupabaseClient() {
    if (!supabaseClient) {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
        
        if (supabaseUrl && supabaseAnonKey) {
            supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
        }
    }
    return supabaseClient;
}

export const verifySupabaseToken = async (token) => {
    try {
        if (!token) {
            return { valid: false, error: 'No token provided' };
        }

        const client = getSupabaseClient();
        if (!client) {
            console.warn('⚠️  Supabase client not configured. Skipping auth validation.');
            return { valid: true, user: null };
        }

        // Use Supabase client to verify and get user
        const { data: { user }, error } = await client.auth.getUser(token);
        
        if (error || !user) {
            return {
                valid: false,
                error: error?.message || 'Invalid token',
            };
        }
        
        return {
            valid: true,
            user: {
                id: user.id,
                email: user.email,
                role: user.role || 'authenticated',
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
        const client = getSupabaseClient();
        
        console.log('\n🔐 Auth Middleware:');
        console.log(`   ├─ Token present: ${!!token}`);
        console.log(`   ├─ Supabase client configured: ${!!client}`);
        
        if (!client) {
            console.log(`   └─ ⚠️  Skipping auth (Supabase not configured)`);
            socket.authenticated = false;
            socket.user = null;
            return next();
        }

        if (!token) {
            console.log(`   └─ ⚠️  No token provided - anonymous user`);
            socket.authenticated = false;
            socket.user = null;
            return next();
        }

        const result = await verifySupabaseToken(token);
        
        if (result.valid && result.user) {
            socket.authenticated = true;
            socket.user = result.user;
            console.log(`   ├─ ✅ Token valid`);
            console.log(`   ├─ 📧 Email: ${result.user?.email}`);
            console.log(`   └─ 🆔 User ID: ${result.user?.id}`);
        } else {
            socket.authenticated = false;
            socket.user = null;
            console.log(`   └─ ❌ Invalid token: ${result.error}`);
        }

        next();
    } catch (error) {
        console.error('❌ Auth middleware error:', error);
        socket.authenticated = false;
        socket.user = null;
        next();
    }
};
