// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { AUTH_MESSAGES } from 'auth/auth.constants';
import {isAuthenticatedRequest} from "../utils/typeGuards";

// Passport стратегии
export const jwtAuth = passport.authenticate('jwt', { session: false });
export const localAuth = passport.authenticate('local', { session: false });

export const googleAuth = passport.authenticate('google', {
    scope: ['profile', 'email']
});

export const googleAuthCallback = passport.authenticate('google', {
    session: false,
    failureRedirect: '/login'
});

// Проверка ролей
export const requireRole = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!isAuthenticatedRequest(req)) {
            return res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
        }

        const user = req.user!; // TypeScript знает что user существует благодаря isAuthenticatedRequest
        if (!roles.includes(user.role)) {
            return res.status(403).json({ error: AUTH_MESSAGES.ERROR.FORBIDDEN });
        }

        next();
    };
};

// Специализированные middleware для ролей
export const isAuthor = requireRole(['author', 'admin']);
export const isAdmin = requireRole(['admin']);