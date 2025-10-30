import { RequestHandler, ErrorRequestHandler } from "express";
import { AuthService } from "./auth.service";
import { JWTService } from "../../utils/jwt";
import { isAuthenticatedRequest } from "../../utils/typeGuards";
import {userService} from "users/user.service";

export const register: RequestHandler = async (req, res, next) => {
    try {
        const { name, email, password, confirmPassword } = req.body;

        // Валидация
        if (!name || !email || !password) {
            res.status(400).json({ error: 'Все поля обязательны' });
            return;
        }

        if (password !== confirmPassword) {
            res.status(400).json({ error: 'Пароли не совпадают' });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
            return;
        }

        // Создание пользователя
        const user = await userService.create({
            name,
            email,
            password,
            role: 'student'
        });

        // Генерируем ОБА токена для реального пользователя
        const accessToken = AuthService.generateAccessToken(user);
        const refreshToken = AuthService.generateRefreshToken(user);

        // Устанавливаем ОБА cookies
        JWTService.setTokensCookies(res, accessToken, refreshToken);

        res.status(201).json({
            message: 'Регистрация успешна',
            token: accessToken,
            user: {
                id: user._id.toString(),
                email: user.email,
                name: user.name,
                role: user.role,
            }
        });
    } catch (e) {
        if (e instanceof Error && e.message.includes('уже существует')) {
            res.status(409).json({ error: 'Пользователь с таким email уже существует' });
            return;
        }
        next(e);
    }
};

export const handleLoginSuccess: RequestHandler = async (req, res, next) => {
    try {
        if (!req.user || !AuthService.isValidUser(req.user)) {
            res.status(401).json({ error: 'Authentication failed' });
            return;
        }

        // Генерируем ОБА токена для реального пользователя
        const accessToken = AuthService.generateAccessToken(req.user);
        const refreshToken = AuthService.generateRefreshToken(req.user);

        // Устанавливаем ОБА cookies
        JWTService.setTokensCookies(res, accessToken, refreshToken);

        res.json({
            message: 'Login successful',
            token: accessToken,
            user: {
                id: req.user._id.toString(),
                email: req.user.email,
                name: req.user.name,
                role: req.user.role,
            }
        });
    } catch (e) { next(e); }
};

export const handleOAuthCallback: RequestHandler = async (req, res, next) => {
    try {
        if (!req.user || !AuthService.isValidUser(req.user)) {
            res.redirect('/login?error=auth_failed');
            return;
        }

        // Генерируем ОБА токена
        const accessToken = AuthService.generateAccessToken(req.user);
        const refreshToken = AuthService.generateRefreshToken(req.user);

        // Устанавливаем ОБА cookies
        JWTService.setTokensCookies(res, accessToken, refreshToken);

        // Редирект на главную
        res.redirect('/');
    } catch (e) { next(e); }
};

export const logout: RequestHandler = async (req, res, next) => {
    try {
        JWTService.clearTokensCookies(res);
        res.json({ message: 'Logout successful' });
    } catch (e) { next(e); }
};

export const refreshToken: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }

        // Генерируем НОВЫЕ токены для реального пользователя
        const newAccessToken = AuthService.generateAccessToken(req.user);
        const newRefreshToken = AuthService.generateRefreshToken(req.user);

        JWTService.setTokensCookies(res, newAccessToken, newRefreshToken);

        res.json({
            message: 'Token refreshed',
            token: newAccessToken,
            user: {
                id: req.user._id.toString(),
                email: req.user.email,
                name: req.user.name,
                role: req.user.role,
            }
        });
    } catch (e) { next(e); }
};

export const getCurrentUser: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }

        res.json({
            user: {
                id: req.user._id.toString(),
                email: req.user.email,
                name: req.user.name,
                role: req.user.role,
            }
        });
    } catch (e) { next(e); }
};

export const handleAuthError: ErrorRequestHandler = async (error, req, res, next) => {
    try {
        res.status(401).json({
            error: error.message || 'Authentication failed'
        });
    } catch (e) { next(e); }
};
