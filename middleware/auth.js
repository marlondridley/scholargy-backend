// backend/middleware/auth.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

// Initialize Supabase client whenever proper credentials are available
const isProduction = process.env.NODE_ENV === 'production';
const hasSupabaseConfig = supabaseUrl && supabaseServiceKey;

if (!hasSupabaseConfig) {
    if (isProduction) {
        console.warn("⚠️ Supabase server-side credentials are not set in production.");
    } else {
        console.log("ℹ️ Supabase not configured for local development - using mock authentication");
    }
} else {
    try {
        supabase = createClient(supabaseUrl, supabaseServiceKey);
        console.log("✅ Supabase client initialized for authentication");
    } catch (error) {
        console.warn("⚠️ Failed to initialize Supabase client:", error.message);
    }
}

const verifyUser = async (req, res, next) => {
    // For local development, allow requests without authentication
    if (!supabase || !isProduction) {
        console.log("ℹ️ Local development mode - authentication bypassed");
        req.user = { 
            id: 'local-dev-user', 
            email: 'dev@scholargy.local',
            role: 'student'
        };
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(500).json({ error: 'Internal server error during authentication.' });
    }
};

module.exports = { verifyUser };
