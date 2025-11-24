// middleware/refresh-token.ts
import { Request, Response, NextFunction } from 'express';
import { userService } from 'users/user.service';
import { authService } from 'auth/auth.service';
import { AUTH_MESSAGES } from 'auth/auth.constants';
import {jwtService} from "jwt/jwt.service";

export const refreshTokenMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Пропускаем публичные routes
        if (!req.path.startsWith('/api/') ||
            req.path === '/api/auth/refresh' ||
            req.path === '/api/auth/login' ||
            req.path === '/api/auth/register') {
            return next();
        }

        const { accessToken, refreshToken } = jwtService.getTokensFromRequest(req);

        // 1. Если нет refresh token - сразу ошибка
        if (!refreshToken) {
            return res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
        }

        let currentUser = null;
        let shouldRefreshTokens = false;

        // 2. Проверяем refresh token
        try {
            const refreshPayload = jwtService.verifyRefreshToken(refreshToken);
            currentUser = await userService.getById(refreshPayload.sub);

            if (!currentUser) {
                jwtService.clearTokensCookies(res);
                return res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
            }

            // 3. Проверяем access token
            if (accessToken) {
                try {
                    jwtService.verifyAccessToken(accessToken);
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
            jwtService.clearTokensCookies(res);
            return res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
        }

        // 4. Если нужно обновить токены
        if (shouldRefreshTokens && currentUser) {
            const newAccessToken = authService.generateAccessToken(currentUser);

            jwtService.setTokensCookies(res, newAccessToken, refreshToken);

            req.user = currentUser;
            return next();
        }

        next();

    } catch (error) { next(error); }
};