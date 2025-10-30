import { Router } from 'express';
import {
    localAuth,
    googleAuth,
    googleAuthCallback,
    isAuthenticated, jwtAuth
} from '../../middleware/auth';
import * as AuthController from './auth.controller';

const authRoutes = Router();

// Регистрация через email
authRoutes.post('/register', AuthController.register);
// Local login (email/password)
authRoutes.post('/login', localAuth, AuthController.handleLoginSuccess);

// Google OAuth routes
authRoutes.get('/google', googleAuth);
authRoutes.get('/google/callback', googleAuthCallback, AuthController.handleOAuthCallback);

// Logout
authRoutes.post('/logout', isAuthenticated, AuthController.logout);

// Refresh token
authRoutes.post('/refresh', isAuthenticated, AuthController.refreshToken);

// Get current user
authRoutes.get('/me', jwtAuth, AuthController.getCurrentUser);

export default authRoutes;