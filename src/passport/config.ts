import passport from 'passport';
import { localStrategy } from './strategy/local.strategy';
import { jwtStrategy } from './strategy/jwt.strategy';
import { googleOAuthStrategy } from './strategy/google-oauth.strategy';
import { githubOAuthStrategy } from './strategy/github-oauth.strategy';

export const initializePassport = (): void => {
  passport.use('local', localStrategy);
  passport.use('jwt', jwtStrategy);

  if (googleOAuthStrategy) {
    passport.use('google', googleOAuthStrategy);
  }

  if (githubOAuthStrategy) {
    passport.use('github', githubOAuthStrategy);
  }
};

export { localStrategy, jwtStrategy, googleOAuthStrategy };
