// google-oauth.strategy.ts
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { userService } from 'users/user.service';
import { config } from '../../config';

export const googleOAuthStrategy = new GoogleStrategy(
    {
        clientID: config.googleClientId,
        clientSecret: config.googleClientSecret,
        callbackURL: config.googleCallbackURL,
        scope: ['profile', 'email']
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            if (!profile.emails?.[0]?.value) {
                return done(new Error('Email не предоставлен Google'), false);
            }

            const user = await userService.findOrCreateFromOAuth(profile);
            return done(null, user);
        } catch (error) {
            console.error('Google OAuth error:', error);
            return done(error, false);
        }
    }
);