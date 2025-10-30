import { Request, Response, NextFunction } from 'express';
import { userService } from '../users/user.service';
import { User } from '../users/user.types';
import { JWTService } from '../../utils/jwt';

export class AuthService {
    // === Валидация учетных данных ===
    static async validateLocalCredentials(
        email: string,
        password: string
    ): Promise<User> {
        return await userService.authenticate(email, password);
    }

    // === OAuth обработка ===
    static async handleOAuthUser(profile: any): Promise<User> {
        return await userService.findOrCreateFromOAuth(profile);
    }

    static generateAccessToken(user: User): string {
        return JWTService.generateAccessToken(user);
    }

    static generateRefreshToken(user: User): string {
        return JWTService.generateRefreshToken(user);
    }

    // === Валидация пользователя ===
    static isValidUser(user: any): user is User {
        return user && user._id && user.email && user.name;
    }

    static checkUserRole(user: User, requiredRoles: string[]): boolean {
        return requiredRoles.includes(user.role);
    }

    // === Новые методы для middleware ===
    static handleJWTAuthentication(req: Request, res: Response, next: NextFunction): void {
        // Простая проверка наличия пользователя в запросе
        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        next();
    }

    static validateSession(req: Request): boolean {
        return !!req.user;
    }

    static getCurrentUser(req: Request): User | undefined {
        return req.user as User | undefined;
    }
}