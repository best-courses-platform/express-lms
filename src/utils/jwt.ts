import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/config';
import { User } from '../modules/users/user.types';

export interface JWTPayload {
    sub: string; // user ID
    email: string;
    role: string;
    name: string;
    iat?: number;
    exp?: number;
}

export class JWTService {
    static generateToken(user: User): string {
        const payload: JWTPayload = {
            sub: user._id.toString(),
            email: user.email,
            role: user.role,
            name: user.name
        };

        // Для jsonwebtoken 9.0.2 используем такой формат
        const options: SignOptions = {
            expiresIn: '7d'
        };

        return jwt.sign(payload, config.jwtSecret, options);
    }

    static verifyToken(token: string): JWTPayload {
        try {
            return jwt.verify(token, config.jwtSecret) as JWTPayload;
        } catch (error) {
            throw new Error('Invalid or expired token');
        }
    }

    static setTokenCookie(res: any, token: string): void {
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
            sameSite: 'lax' as const
        };

        res.cookie('jwt', token, cookieOptions);
    }

    static clearTokenCookie(res: any): void {
        res.clearCookie('jwt');
    }

    static decodeToken(token: string): JWTPayload | null {
        try {
            return jwt.decode(token) as JWTPayload;
        } catch {
            return null;
        }
    }

    static getTokenFromRequest(req: any): string | null {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        if (req.query.token) {
            return req.query.token;
        }

        if (req.cookies && req.cookies.jwt) {
            return req.cookies.jwt;
        }

        return null;
    }
}