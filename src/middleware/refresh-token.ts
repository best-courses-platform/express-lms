// middleware/refresh-token.ts
import { Request, Response, NextFunction } from 'express';
import { JWTService } from 'jwt/jwt.service';
import { userService } from 'users/user.service';
import { authService } from 'auth/auth.service';
import { AUTH_MESSAGES } from 'auth/auth.constants';

export const refreshTokenMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Пропускаем публичные routes
        if (!req.path.startsWith('/api/') ||
            req.path === '/api/auth/refresh' ||
            req.path === '/api/auth/login' ||
            req.path === '/api/auth/register') {
            return next();
        }

        const { accessToken, refreshToken } = JWTService.getTokensFromRequest(req);

        // 1. Если нет refresh token - сразу ошибка
        if (!refreshToken) {
            return res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
        }

        let currentUser = null;
        let shouldRefreshTokens = false;

        // 2. Проверяем refresh token
        try {
            const refreshPayload = JWTService.verifyRefreshToken(refreshToken);
            currentUser = await userService.getById(refreshPayload.sub);

            if (!currentUser) {
                JWTService.clearTokensCookies(res);
                return res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
            }

            // 3. Проверяем access token
            if (accessToken) {
                try {
                    JWTService.verifyAccessToken(accessToken);
                    // Access token валиден - используем как есть
                    req.user = currentUser;
                    return next();
                } catch (accessError) {
                    shouldRefreshTokens = true;
                }
            } else {
                shouldRefreshTokens = true;
            }

        } catch (refreshError) {
            JWTService.clearTokensCookies(res);
            return res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
        }

        // 4. Если нужно обновить токены
        if (shouldRefreshTokens && currentUser) {
            const newAccessToken = authService.generateAccessToken(currentUser);

            JWTService.setTokensCookies(res, newAccessToken, refreshToken);

            req.user = currentUser;
            return next();
        }

        next();

    } catch (error) { next(error); }
};