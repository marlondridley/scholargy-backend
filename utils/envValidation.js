// backend/utils/envValidation.js
const validateEnvironment = () => {
    const isProduction = process.env.NODE_ENV === 'production';
    
    const requiredVars = {
        // Supabase Configuration (enforced only in production)
        ...(isProduction && {
            SUPABASE_URL: process.env.SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        }),
        
        // Database Configuration
        COSMOS_DB_CONNECTION_STRING: process.env.COSMOS_DB_CONNECTION_STRING,
        DB_NAME: process.env.DB_NAME,
        
        // Azure OpenAI Configuration
        AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
        AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
        AZURE_OPENAI_DEPLOYMENT_NAME: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
        AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME,
        
        // Redis Configuration (Optional for production)
        AZURE_REDIS_CONNECTION_STRING: process.env.AZURE_REDIS_CONNECTION_STRING,
    };

    const missingVars = [];
    const warnings = [];

    // Check required variables
    Object.entries(requiredVars).forEach(([key, value]) => {
        if (!value) {
            if (key === 'AZURE_REDIS_CONNECTION_STRING') {
                warnings.push(`${key} - Caching will be disabled`);
            } else {
                missingVars.push(key);
            }
        }
    });

    // Log warnings
    if (warnings.length > 0) {
        console.warn('⚠️ Environment warnings:');
        warnings.forEach(warning => console.warn(`   ${warning}`));
    }

    // Log production-specific information
    if (isProduction) {
        console.log('🏭 Production mode: Supabase authentication is required');
    } else {
        console.log('🔧 Development mode: Supabase authentication is optional');
    }

    // Throw error for missing required variables
    if (missingVars.length > 0) {
        const errorMessage = `❌ Missing required environment variables:\n${missingVars.map(v => `   - ${v}`).join('\n')}`;
        console.error(errorMessage);
        throw new Error('Environment validation failed');
    }

    console.log('✅ Environment validation passed');
    return true;
};

module.exports = { validateEnvironment };
