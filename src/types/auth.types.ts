import { Request, Response, NextFunction } from 'express';
import { User } from 'users/user.types';

// Типы для стратегий аутентификации
export type VerifyCallback = (
    error: any,
    user?: User | false,
    options?: { message: string }
) => void;

export type LocalStrategyVerify = (
    email: string,
    password: string,
    done: VerifyCallback
) => Promise<void>;

export type AuthenticateCallback = (
    err: any,
    user?: User | false,
    info?: { message: string }
) => void;

export type AuthMiddleware = (req: Request, res: Response, next: NextFunction) => void;
export type RoleMiddleware = (roles: string[]) => AuthMiddleware;