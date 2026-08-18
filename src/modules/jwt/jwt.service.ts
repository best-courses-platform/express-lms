// jwt/jwt.service.ts
import jwt from 'jsonwebtoken';
import { Response } from 'express';
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

    return jwt.sign(validatedPayload, config.jwtRefreshSecret, {
      expiresIn: config.jwtRefreshExpiresIn,
      algorithm: 'HS256',
    } as jwt.SignOptions);
  }

  verifyRefreshToken(token: string): JWTPayload {
    try {
      const payload = jwt.verify(token, config.jwtRefreshSecret);
      const validatedPayload = validateJWTPayload(payload);

      // Без этой проверки access-токен (подписанный тем же алгоритмом) мог бы быть
      // подсунут в /api/auth/refresh как будто это refresh-токен — claim type это исключает
      // как второй, независимый от секрета барьер.
      if (validatedPayload.type !== 'refresh') {
        throw new Error(AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN);
      }

      return validatedPayload;
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
}

export const jwtService = new JWTService();
