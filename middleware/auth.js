// backend/middleware/auth.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Supabase server-side credentials are not set.");
    throw new Error("Supabase server-side credentials are not configured.");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const verifyUser = async (req, res, next) => {
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
        return res.status(500).json({ error: 'Internal server error during authentication.' });
    }
};

module.exports = { verifyUser };
