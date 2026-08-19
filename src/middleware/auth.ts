import { NextFunction, Request, Response } from 'express';
import passport from 'passport';
import { AUTH_MESSAGES } from 'auth/auth.constants';
import { isAuthenticatedRequest } from '../utils/typeGuards';
import { config } from '../config';

// Passport стратегии
export const jwtAuth = passport.authenticate('jwt', { session: false });
export const localAuth = passport.authenticate('local', { session: false });

// Опциональная аутентификация: не отклоняет запрос без токена (или с невалидным токеном) —
// просто пытается подставить req.user, если получится. Нужна для роутов, которые одновременно
// публичные (анонимный доступ к опубликованному контенту) и приватные (автор/allowedUsers видят
// больше) — например, GET /api/courses/:id.
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('jwt', { session: false }, (_err: unknown, user: Express.User | false) => {
    if (user) {
      req.user = user;
    }
    next();
  })(req, res, next);
};

export const googleAuth = passport.authenticate('google', {
  scope: ['profile', 'email'],
});

// failureRedirect — абсолютный URL на фронтенд, не относительный путь: относительный
// '/login' резолвился бы на сам Express (нет своего /login после выпиливания
// hbs-вьюх), а не на lms-web. Та же причина и тот же паттерн, что и в
// handleOAuthCallback (auth.controller.ts) для успешного случая.
export const googleAuthCallback = passport.authenticate('google', {
  session: false,
  failureRedirect: `${config.frontendUrl}/login?error=auth_failed`,
});

export const githubAuth = passport.authenticate('github', {
  scope: ['user:email'],
});

export const githubAuthCallback = passport.authenticate('github', {
  session: false,
  failureRedirect: `${config.frontendUrl}/login?error=auth_failed`,
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
