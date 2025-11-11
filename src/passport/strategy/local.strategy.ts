import { Strategy as LocalStrategy } from 'passport-local';
import { AuthService } from 'auth/auth.service';

export const localStrategy = new LocalStrategy(
    {
        usernameField: 'email',
        passwordField: 'password'
    },
    async (email: string, password: string, done: any) => {
        try {
            const user = await AuthService.validateLocalCredentials(email, password);
            return done(null, user);
        } catch (error: any) {
            return done(null, false, { message: error.message });
        }
    }
);
