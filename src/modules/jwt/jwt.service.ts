// jwt/jwt.service.ts
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { User } from 'users/user.types';
import { JWTPayload, validateJWTPayload } from './jwt.schema';
import { AUTH_MESSAGES } from 'auth/auth.constants';

export class JWTService {
    static generateAccessToken(user: User): string {
        const payload: JWTPayload = {
            sub: user._id.toString(),
            email: user.email,
            role: user.role,
            name: user.name,
            type: 'access'
        };

        const validatedPayload = validateJWTPayload(payload);

        return jwt.sign(
            validatedPayload,
            config.jwtSecret,
            {
                expiresIn: config.jwtAccessExpiresIn,
                algorithm: 'HS256'
            } as jwt.SignOptions
        );
    }

    static generateRefreshToken(user: User): string {
        const payload: JWTPayload = {
            sub: user._id.toString(),
            email: user.email,
            role: user.role,
            name: user.name,
            type: 'refresh'
        };

        const validatedPayload = validateJWTPayload(payload);
        const secret = config.jwtRefreshSecret || config.jwtSecret;

        return jwt.sign(
            validatedPayload,
            secret,
            {
                expiresIn: config.jwtRefreshExpiresIn,
                algorithm: 'HS256'
            } as jwt.SignOptions
        );
    }

    static verifyAccessToken(token: string): JWTPayload {
        try {
            const payload = jwt.verify(token, config.jwtSecret);
            return validateJWTPayload(payload);
        } catch (error) {
            throw new Error(AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN);
        }
    }

    static verifyRefreshToken(token: string): JWTPayload {
        try {
            const secret = config.jwtRefreshSecret || config.jwtSecret;
            const payload = jwt.verify(token, secret);
            return validateJWTPayload(payload);
        } catch (error) {
            throw new Error(AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN);
        }
    }

    static setTokensCookies(res: any, accessToken: string, refreshToken: string): void {
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const
        };

        res.cookie('access_token', accessToken, {
            ...cookieOptions,
            maxAge: 8 * 60 * 60 * 1000 // 8 часов
        });

        res.cookie('refresh_token', refreshToken, {
            ...cookieOptions,
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 дней
        });
    }

    static clearTokensCookies(res: any): void {
        res.clearCookie('access_token');
        res.clearCookie('refresh_token');
    }

    static getTokensFromRequest(req: any): {
        accessToken: string | null;
        refreshToken: string | null
    } {
        const authHeader = req.headers.authorization;
        let accessToken = null;
        let refreshToken = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            accessToken = authHeader.substring(7);
        }

        if (req.cookies) {
            accessToken = req.cookies.access_token || accessToken;
            refreshToken = req.cookies.refresh_token;
        }

        if (req.query.token) {
            accessToken = req.query.token;
        }

        return { accessToken, refreshToken };
    }
}