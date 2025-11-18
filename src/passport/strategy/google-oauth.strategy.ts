// google-oauth.strategy.ts
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { userService } from 'users/user.service';
import { config } from '../../config';
import {AUTH_MESSAGES} from "auth/auth.constants";

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
                return done(new Error(AUTH_MESSAGES.ERROR.OAUTH_EMAIL_NOT_PROVIDED), false);
            }

            const user = await userService.findOrCreateFromOAuth(profile);
            return done(null, user);
        } catch (error) {
            console.error(AUTH_MESSAGES.ERROR.GOOGLE_OAUTH_ERROR, error);
            return done(error, false);
        }
    }
);