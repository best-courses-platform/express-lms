import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { AuthService } from 'auth/auth.service';

// Type guard (реэкспорт из сервиса)
export const isAuthenticatedUser = AuthService.isValidUser;

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

// Основная проверка аутентификации
export const isAuthenticated = (req: Request, res: Response, next: NextFunction): void => {
    AuthService.handleJWTAuthentication(req, res, next);
};

// Проверка ролей
export const requireRole = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!AuthService.validateSession(req)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const user = AuthService.getCurrentUser(req);
        if (!user || !AuthService.checkUserRole(user, roles)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
};

// Специализированные middleware для ролей
export const isAuthor = requireRole(['author', 'admin']);
export const isAdmin = requireRole(['admin']);
