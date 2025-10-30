import { Request, Response, NextFunction } from 'express';
import { userService } from '../users/user.service';
import { User } from '../users/user.types';
import { JWTService } from '../../utils/jwt';

export class AuthService {
    static async validateLocalCredentials(
        email: string,
        password: string
    ): Promise<User> {
        return await userService.authenticate(email, password);
    }

    static generateAccessToken(user: User): string {
        return JWTService.generateAccessToken(user);
    }

    static generateRefreshToken(user: User): string {
        return JWTService.generateRefreshToken(user);
    }

    static isValidUser(user: any): user is User {
        return user && user._id && user.email && user.name;
    }

    static checkUserRole(user: User, requiredRoles: string[]): boolean {
        return requiredRoles.includes(user.role);
    }

    static handleJWTAuthentication(req: Request, res: Response, next: NextFunction): void {
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