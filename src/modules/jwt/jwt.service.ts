// jwt/jwt.service.ts
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { config } from '../../config';
import { User } from 'users/user.types';
import { JWTPayload, validateJWTPayload } from './jwt.schema';
import { AUTH_MESSAGES } from 'auth/auth.constants';

export class JWTService {
  generateAccessToken(user: User): string {
    const payload: JWTPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
      type: 'access',
    };

    const validatedPayload = validateJWTPayload(payload);

    return jwt.sign(validatedPayload, config.jwtSecret, {
      expiresIn: config.jwtAccessExpiresIn,
      algorithm: 'HS256',
    } as jwt.SignOptions);
  }

  generateRefreshToken(user: User): string {
    const payload: JWTPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
      type: 'refresh',
    };

    const validatedPayload = validateJWTPayload(payload);
    const secret = config.jwtRefreshSecret || config.jwtSecret;

    return jwt.sign(validatedPayload, secret, {
      expiresIn: config.jwtRefreshExpiresIn,
      algorithm: 'HS256',
    } as jwt.SignOptions);
  }

  verifyAccessToken(token: string): JWTPayload {
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      return validateJWTPayload(payload);
    } catch {
      throw new Error(AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN);
    }
  }

  verifyRefreshToken(token: string): JWTPayload {
    try {
      const secret = config.jwtRefreshSecret || config.jwtSecret;
      const payload = jwt.verify(token, secret);
      return validateJWTPayload(payload);
    } catch {
      throw new Error(AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN);
    }
  }

  setTokensCookies(res: Response, accessToken: string, refreshToken: string): void {
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
    };

    res.cookie('access_token', accessToken, {
      ...cookieOptions,
      maxAge: 8 * 60 * 60 * 1000, // 8 часов
    });

    res.cookie('refresh_token', refreshToken, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
    });
  }

  clearTokensCookies(res: Response): void {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
  }

  getTokensFromRequest(req: Request): {
    accessToken: string | null;
    refreshToken: string | null;
  } {
    const authHeader = req.headers.authorization;
    let accessToken: string | null = null;
    let refreshToken: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7);
    }

    if (req.cookies) {
      accessToken = (req.cookies.access_token as string) || accessToken;
      refreshToken = req.cookies.refresh_token as string;
    }

    if (req.query.token && typeof req.query.token === 'string') {
      accessToken = req.query.token;
    }

    return { accessToken, refreshToken };
  }
}

export const jwtService = new JWTService();
