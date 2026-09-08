import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { config } from '../../config';
import { User } from 'users/user.types';
import { JWTPayload, validateJWTPayload } from './jwt.schema';
import { parseDurationMs } from '../../utils/duration';

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

  // generateRefreshToken/verifyRefreshToken удалены (заметка 31, раздел 4.2/5.5) — refresh
  // больше не JWT, а opaque-строка "<sessionId>.<secret>" из refresh-session.service.ts;
  // подписывать/проверять его как JWT незачем, всё равно на каждый обмен идёт поход в БД.

  setTokensCookies(res: Response, accessToken: string, refreshToken: string): void {
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
    };

    // maxAge берётся из тех же config.jwtAccessExpiresIn/jwtRefreshExpiresIn, которыми
    // подписан сам токен — раньше здесь было отдельное захардкоженное число (8 часов),
    // синхронизировать которое с config.jwtAccessExpiresIn при изменении TTL нужно было
    // вручную, и ничто (ни typecheck, ни тесты) не поймало бы расхождение.
    res.cookie('access_token', accessToken, {
      ...cookieOptions,
      maxAge: parseDurationMs(config.jwtAccessExpiresIn),
    });

    res.cookie('refresh_token', refreshToken, {
      ...cookieOptions,
      maxAge: parseDurationMs(config.jwtRefreshExpiresIn),
    });
  }

  clearTokensCookies(res: Response): void {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
  }
}

export const jwtService = new JWTService();
