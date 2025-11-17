// domains/auth/auth.controller.ts
import { RequestHandler } from "express";
import {authService} from "./auth.service";
import { JWTService } from "jwt/jwt.service";
import { isAuthenticatedRequest } from "../../utils/typeGuards";
import { userService } from "users/user.service";
import { validate } from "../../middleware/validate";
import {
    registerSchema,
    loginSchema,
    refreshTokenSchema,
    updateProfileSchema,
    changePasswordSchema
} from "./auth.schema";
import { AUTH_MESSAGES } from "./auth.constants";

export const register: RequestHandler = async (req, res, next) => {
    try {
        const { user, accessToken, refreshToken } = await authService.register(req.body);

        JWTService.setTokensCookies(res, accessToken, refreshToken);

        res.status(201).json({
            message: AUTH_MESSAGES.SUCCESS.REGISTERED,
            token: accessToken,
            user: {
                id: user._id.toString(),
                email: user.email,
                name: user.name,
                role: user.role,
            }
        });
    } catch (error) {
        next(error);
    }
};

export const login: RequestHandler = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const { user, accessToken, refreshToken } = await authService.login(email, password);

        JWTService.setTokensCookies(res, accessToken, refreshToken);

        res.json({
            message: AUTH_MESSAGES.SUCCESS.LOGGED_IN,
            token: accessToken,
            user: {
                id: user._id.toString(),
                email: user.email,
                name: user.name,
                role: user.role,
            }
        });
    } catch (error) {
        next(error);
    }
};

export const handleLoginSuccess: RequestHandler = async (req, res, next) => {
    try {
        if (!req.user || !authService.isValidUser(req.user)) {
            res.status(401).json({ error: AUTH_MESSAGES.ERROR.AUTH_FAILED });
            return;
        }

        const accessToken = authService.generateAccessToken(req.user);
        const refreshToken = authService.generateRefreshToken(req.user);

        JWTService.setTokensCookies(res, accessToken, refreshToken);

        res.json({
            message: AUTH_MESSAGES.SUCCESS.LOGGED_IN,
            token: accessToken,
            user: {
                id: req.user._id.toString(),
                email: req.user.email,
                name: req.user.name,
                role: req.user.role,
            }
        });
    } catch (error) {
        next(error);
    }
};

export const handleOAuthCallback: RequestHandler = async (req, res, next) => {
    try {
        if (!req.user || !authService.isValidUser(req.user)) {
            res.redirect('/login?error=auth_failed');
            return;
        }

        const accessToken = authService.generateAccessToken(req.user);
        const refreshToken = authService.generateRefreshToken(req.user);

        JWTService.setTokensCookies(res, accessToken, refreshToken);

        res.redirect('/');
    } catch (error) {
        next(error);
    }
};

export const logout: RequestHandler = async (req, res, next) => {
    try {
        JWTService.clearTokensCookies(res);
        res.json({ message: AUTH_MESSAGES.SUCCESS.LOGGED_OUT });
    } catch (error) {
        next(error);
    }
};

export const refreshToken: RequestHandler = async (req, res, next) => {
    try {
        const { refreshToken: bodyRefreshToken } = req.body;
        const cookieRefreshToken = req.cookies?.refresh_token;
        const refreshToken = bodyRefreshToken || cookieRefreshToken;

        if (!refreshToken) {
            return res.status(401).json({ error: AUTH_MESSAGES.ERROR.REFRESH_TOKEN_REQUIRED });
        }

        const { user, accessToken, refreshToken: newRefreshToken } = await authService.refreshTokens(refreshToken);

        JWTService.setTokensCookies(res, accessToken, newRefreshToken);

        res.json({
            message: AUTH_MESSAGES.SUCCESS.TOKENS_REFRESHED,
            token: accessToken,
            user: {
                id: user._id.toString(),
                email: user.email,
                name: user.name,
                role: user.role,
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getCurrentUser: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            return res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
        }

        res.json({
            user: {
                id: req.user._id.toString(),
                email: req.user.email,
                name: req.user.name,
                role: req.user.role,
                createdAt: req.user.createdAt,
                updatedAt: req.user.updatedAt
            }
        });
    } catch (error) {
        next(error);
    }
};

export const updateProfile: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            return res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
        }

        const updateData = req.body;
        const updatedUser = await userService.update(req.user._id.toString(), updateData);

        res.json({
            message: AUTH_MESSAGES.SUCCESS.PROFILE_UPDATED,
            user: {
                id: updatedUser._id.toString(),
                email: updatedUser.email,
                name: updatedUser.name,
                role: updatedUser.role,
                createdAt: updatedUser.createdAt,
                updatedAt: updatedUser.updatedAt
            }
        });
    } catch (error) {
        next(error);
    }
};

export const changePassword: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            return res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
        }

        const { currentPassword, newPassword } = req.body;

        await authService.changePassword(
            req.user._id.toString(),
            currentPassword,
            newPassword
        );

        res.json({ message: AUTH_MESSAGES.SUCCESS.PASSWORD_CHANGED });
    } catch (error) {
        next(error);
    }
};

// Экспорт с валидацией для использования в routes
export const AuthController = {
    register: [validate(registerSchema), register],
    login: [validate(loginSchema), login],
    handleLoginSuccess,
    handleOAuthCallback,
    logout,
    refreshToken: [validate(refreshTokenSchema), refreshToken],
    getCurrentUser,
    updateProfile: [validate(updateProfileSchema), updateProfile],
    changePassword: [validate(changePasswordSchema), changePassword]
};