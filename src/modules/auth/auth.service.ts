// domains/auth/auth.service.ts
import { Request, Response, NextFunction } from 'express';
import { userService } from 'users/user.service';
import { User, NewUser } from 'users/user.types';
import { JWTService } from 'jwt/jwt.service';
import { AppError } from '../../utils/errors';
import { AUTH_MESSAGES } from './auth.constants';
import { isUserDocumentStrict, isUserWithPassword, toSafeUser } from '../../utils/typeGuards';
import {userRepository} from "users/user.repository";

export class AuthService {
    async register(userData: {
        name: string;
        email: string;
        password: string;
        role: string;
    }): Promise<{ user: User; accessToken: string; refreshToken: string }> {
        try {
            // Создаем пользователя через userService
            const user = await userService.create(userData as NewUser);

            // Генерируем токены
            const accessToken = this.generateAccessToken(user);
            const refreshToken = this.generateRefreshToken(user);

            return { user, accessToken, refreshToken };
        } catch (error) {
            if (error instanceof AppError) {
                throw error; // Пробрасываем доменные ошибки userService
            }
            throw new AppError(500, AUTH_MESSAGES.ERROR.AUTH_FAILED, error);
        }
    }

    async authenticate(email: string, password: string): Promise<User> {
        const user = await userRepository.findByEmailWithPassword(email);

        if (!user) {
            throw new AppError(401, AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
        }

        if (!isUserDocumentStrict(user)) {
            throw new AppError(500, AUTH_MESSAGES.ERROR.AUTHENTICATION_ERROR);
        }

        const isValidPassword = await user.comparePassword(password);

        if (!isValidPassword) {
            throw new AppError(401, AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
        }

        const userPlainObject = user.toObject<User & { password: string }>();

        if (!isUserWithPassword(userPlainObject)) {
            throw new AppError(500, AUTH_MESSAGES.ERROR.AUTH_FAILED);
        }

        const { password: _, ...userWithoutPassword } = userPlainObject;
        return toSafeUser(userWithoutPassword);
    }

    async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
        const user = await userRepository.findByEmailWithPassword(userId);

        if (!user) {
            throw new AppError(404, AUTH_MESSAGES.ERROR.AUTH_FAILED);
        }

        if (!isUserDocumentStrict(user)) {
            throw new AppError(500, AUTH_MESSAGES.ERROR.AUTHENTICATION_ERROR);
        }

        const isCurrentPasswordValid = await user.comparePassword(currentPassword);
        if (!isCurrentPasswordValid) {
            throw new AppError(400, AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
        }

        user.password = newPassword;
        await user.save();
    }

    async login(email: string, password: string): Promise<{ user: User; accessToken: string; refreshToken: string }> {
        try {
            const user = await this.authenticate(email, password);
            const accessToken = this.generateAccessToken(user);
            const refreshToken = this.generateRefreshToken(user);

            return { user, accessToken, refreshToken };
        } catch (error) {
            if (error instanceof AppError) {
                throw error; // Уже используем auth ошибки
            }
            throw new AppError(500, AUTH_MESSAGES.ERROR.AUTH_FAILED, error);
        }
    }

    async refreshTokens(refreshToken: string): Promise<{ user: User; accessToken: string; refreshToken: string }> {
        try {
            const payload = JWTService.verifyRefreshToken(refreshToken);
            const user = await userService.getById(payload.sub);

            if (!user) {
                throw new AppError(401, AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN);
            }

            const newAccessToken = this.generateAccessToken(user);
            const newRefreshToken = this.generateRefreshToken(user);

            return { user, accessToken: newAccessToken, refreshToken: newRefreshToken };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(401, AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN, error);
        }
    }

    generateAccessToken(user: User): string {
        return JWTService.generateAccessToken(user);
    }

    generateRefreshToken(user: User): string {
        return JWTService.generateRefreshToken(user);
    }

    isValidUser(user: any): user is User {
        return user && user._id && user.email && user.name;
    }
}

export const authService = new AuthService();
