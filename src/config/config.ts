import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: process.env.PORT || 3000,
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/best-courses-ever',
    sessionSecret: process.env.SESSION_SECRET || '',
    jwtSecret: process.env.JWT_SECRET || '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '',

    // Google OAuth
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    googleCallbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
};

export function validateConfig() {
    console.log('Config validation:');
    console.log('JWT_SECRET:', config.jwtSecret ? '✓ set' : '✗ missing');
    console.log('GOOGLE_CLIENT_ID:', config.googleClientId ? '✓ set' : '✗ missing');
    console.log('GOOGLE_CLIENT_SECRET:', config.googleClientSecret ? '✓ set' : '✗ missing');

    const required = ['jwtSecret', 'googleClientId', 'googleClientSecret'];
    const missing = required.filter(key => !config[key as keyof typeof config]);

    if (missing.length > 0) {
        console.warn(`Warning: Missing environment variables: ${missing.join(', ')}`);
        return false;
    }

    console.log('All required environment variables are set');
    return true;
}