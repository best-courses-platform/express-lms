import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { userService } from 'users/user.service';
import { config } from '../../config/config';

export const googleOAuthStrategy = new GoogleStrategy(
    {
        clientID: config.googleClientId,
        clientSecret: config.googleClientSecret,
        callbackURL: config.googleCallbackURL,
        scope: ['profile', 'email']
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            const user = await userService.findOrCreateFromOAuth(profile);
            return done(null, user);
        } catch (error) {
            return done(error, false);
        }
    }
);