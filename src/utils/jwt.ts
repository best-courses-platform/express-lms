import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { User } from '../modules/users/user.types';

export interface JWTPayload {
    sub: string; // user ID
    email: string;
    role: string;
    name: string;
    iat?: number;
    exp?: number;
    type?: 'access' | 'refresh'; // ← ДОБАВИТЬ тип токена
}

export class JWTService {
    static generateAccessToken(user: User): string {
        const payload: JWTPayload = {
            sub: user._id.toString(),
            email: user.email,
            role: user.role,
            name: user.name,
            type: 'access'
        };

        return jwt.sign(payload, config.jwtSecret, {
            expiresIn: config.jwtAccessExpiresIn
        } as jwt.SignOptions);
    }

    static generateRefreshToken(user: User): string {
        const payload: JWTPayload = {
            sub: user._id.toString(),
            email: user.email,
            role: user.role,
            name: user.name,
            type: 'refresh'
        };

        const secret = config.jwtRefreshSecret || config.jwtSecret;

        return jwt.sign(payload, secret, {
            expiresIn: config.jwtRefreshExpiresIn
        } as jwt.SignOptions);
    }

    // Верификация Access Token
    static verifyAccessToken(token: string): JWTPayload {
        try {
            const payload = jwt.verify(token, config.jwtSecret) as JWTPayload;
            if (payload.type !== 'access') {
                throw new Error('Invalid token type');
            }
            return payload;
        } catch (error) {
            throw new Error('Invalid or expired access token');
        }
    }

    // Верификация Refresh Token
    static verifyRefreshToken(token: string): JWTPayload {
        try {
            const secret = config.jwtRefreshSecret || config.jwtSecret;
            const payload = jwt.verify(token, secret) as JWTPayload;
            if (payload.type !== 'refresh') {
                throw new Error('Invalid token type');
            }
            return payload;
        } catch (error) {
            throw new Error('Invalid or expired refresh token');
        }
    }

    // Установка ОБОИХ токенов в cookies
    static setTokensCookies(res: any, accessToken: string, refreshToken: string): void {
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const
        };

        // // Access token (8 часов)
        // res.cookie('access_token', accessToken, {
        //     ...cookieOptions,
        //     maxAge: 8 * 60 * 60 * 1000 // 8 часов
        // });
        //
        // // Refresh token (30 дней)
        // res.cookie('refresh_token', refreshToken, {
        //     ...cookieOptions,
        //     maxAge: 30 * 24 * 60 * 60 * 1000 // 30 дней
        // });

        // Access token (1 минута)
        res.cookie('access_token', accessToken, {
            ...cookieOptions,
            maxAge: 1 * 60 * 1000 // 1 минута
        });

        // Refresh token (5 минут)
        res.cookie('refresh_token', refreshToken, {
            ...cookieOptions,
            maxAge: 5 * 60 * 1000 // 5 минут
        });
    }

    // Очистка ВСЕХ cookies
    static clearTokensCookies(res: any): void {
        res.clearCookie('access_token');
        res.clearCookie('refresh_token');
        res.clearCookie('jwt'); // ← для обратной совместимости
    }

    // Получение токенов из запроса
    static getTokensFromRequest(req: any): {
        accessToken: string | null;
        refreshToken: string | null
    } {
        const authHeader = req.headers.authorization;
        let accessToken = null;
        let refreshToken = null;

        // Из Bearer header
        if (authHeader && authHeader.startsWith('Bearer ')) {
            accessToken = authHeader.substring(7);
        }

        // Из cookies
        if (req.cookies) {
            accessToken = req.cookies.access_token || accessToken;
            refreshToken = req.cookies.refresh_token;

            // Обратная совместимость со старым 'jwt' cookie
            if (!accessToken && req.cookies.jwt) {
                accessToken = req.cookies.jwt;
            }
        }

        // Из query параметра
        if (req.query.token) {
            accessToken = req.query.token;
        }

        return { accessToken, refreshToken };
    }
}