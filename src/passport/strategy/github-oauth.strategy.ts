// passport/strategy/github-oauth.strategy.ts
import { Strategy as GitHubStrategy } from 'passport-github2';
import { userService } from 'users/user.service';
import { config } from '../../config';
import { AUTH_MESSAGES } from 'auth/auth.constants';
import { DoneCallback, OAuthProfile } from 'auth/auth.types';

export const githubOAuthStrategy = new GitHubStrategy(
  {
    clientID: config.githubClientId,
    clientSecret: config.githubClientSecret,
    callbackURL: config.githubCallbackURL,
    scope: ['user:email'],
  },
  async (accessToken: string, refreshToken: string, profile: OAuthProfile, done: DoneCallback) => {
    try {
      let email = profile.emails?.[0]?.value;

      if (!email && accessToken) {
        try {
          const response = await fetch('https://api.github.com/user/emails', {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/vnd.github.v3+json',
            },
          });

          if (response.ok) {
            const emails: Array<{
              email: string;
              primary: boolean;
              verified: boolean;
              visibility: string | null;
            }> = await response.json();

            const primaryEmail = emails.find(e => e.primary && e.verified);
            email = primaryEmail?.email || emails[0]?.email;
          }
        } catch (error) {
          console.error(AUTH_MESSAGES.ERROR.GITHUB_EMAIL_FETCH_ERROR, error);
        }
      }

      if (!email) {
        return done(new Error(AUTH_MESSAGES.ERROR.GITHUB_EMAIL_NOT_PROVIDED), false);
      }

      // Преобразуем в полный OAuthProfile
      const oauthProfile: OAuthProfile = {
        ...profile,
        displayName: profile.displayName || profile.username || 'GitHub User',
        provider: 'github',
        emails: [{ value: email }],
      };

      const user = await userService.findOrCreateFromOAuth(oauthProfile);
      return done(null, user);
    } catch (error) {
      console.error(AUTH_MESSAGES.ERROR.GITHUB_OAUTH_ERROR, error);

      if (error instanceof Error) {
        return done(error, false);
      }

      return done(new Error(AUTH_MESSAGES.ERROR.GITHUB_OAUTH_ERROR), false);
    }
  }
);
