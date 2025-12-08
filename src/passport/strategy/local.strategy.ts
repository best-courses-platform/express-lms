import { Strategy as LocalStrategy } from 'passport-local';
import { authService } from 'auth/auth.service';

type DoneCallback = (error: unknown, user?: Express.User | false, options?: { message: string }) => void;

export const localStrategy = new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password',
  },
  async (email: string, password: string, done: DoneCallback) => {
    try {
      const user = await authService.authenticate(email, password);
      return done(null, user);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      return done(null, false, { message });
    }
  }
);
