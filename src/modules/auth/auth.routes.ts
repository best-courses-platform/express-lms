// auth.routes.ts
import { Router } from 'express';
import {
    localAuth,
    googleAuth,
    googleAuthCallback,
    jwtAuth
} from '../../middleware/auth';
import { AuthController } from './auth.controller';

const authRoutes = Router();

// Регистрация и вход
authRoutes.post('/register', ...AuthController.register);
authRoutes.post('/login', ...AuthController.login);
authRoutes.post('/login/local', localAuth, AuthController.handleLoginSuccess);

// Google OAuth
authRoutes.get('/google', googleAuth);
authRoutes.get('/google/callback', googleAuthCallback, AuthController.handleOAuthCallback);

// Токены и сессии
authRoutes.post('/refresh', ...AuthController.refreshToken);
authRoutes.post('/logout', jwtAuth, AuthController.logout);

// Профиль пользователя
authRoutes.get('/me', jwtAuth, AuthController.getCurrentUser);
authRoutes.patch('/profile', jwtAuth, ...AuthController.updateProfile);
authRoutes.post('/change-password', jwtAuth, ...AuthController.changePassword);

export default authRoutes;