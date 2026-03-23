// domains/auth/auth.routes.ts
// import { Router } from 'express';
// import {
//   githubAuth,
//   githubAuthCallback,
//   googleAuth,
//   googleAuthCallback,
//   jwtAuth,
//   localAuth,
// } from '../../middleware/auth';
// import { AuthController } from './auth.controller';
// import { requireVerifiedEmail } from '../../middleware/require-verified-email';
//
// const authRoutes = Router();
//
// // Регистрация и вход
// authRoutes.post('/register', ...AuthController.register);
// authRoutes.post('/login', ...AuthController.login);
// authRoutes.post('/login/local', localAuth, AuthController.handleLoginSuccess);
//
// // Google OAuth
// authRoutes.get('/google', googleAuth);
// authRoutes.get('/google/callback', googleAuthCallback, AuthController.handleOAuthCallback);
//
// // GitHub OAuth
// authRoutes.get('/github', githubAuth);
// authRoutes.get('/github/callback', githubAuthCallback, AuthController.handleOAuthCallback);
//
// // Токены и сессии
// authRoutes.post('/refresh', ...AuthController.refreshToken);
// authRoutes.post('/logout', jwtAuth, requireVerifiedEmail, AuthController.logout);
//
// // Профиль пользователя
// authRoutes.get('/me', jwtAuth, requireVerifiedEmail, AuthController.getCurrentUser);
// authRoutes.patch('/profile', jwtAuth, requireVerifiedEmail, ...AuthController.updateProfile);
// authRoutes.post('/change-password', jwtAuth, requireVerifiedEmail, ...AuthController.changePassword);
//
// // Верификация через email
// authRoutes.get('/verify-email', AuthController.verifyEmail);
// authRoutes.post('/resend-verification', ...AuthController.resendVerification);
// authRoutes.post('/request-password-reset', ...AuthController.requestPasswordReset);
// authRoutes.post('/reset-password', ...AuthController.resetPassword);
//
// export default authRoutes;

import { Router } from 'express';
import {
  githubAuth,
  githubAuthCallback,
  googleAuth,
  googleAuthCallback,
  jwtAuth,
  localAuth,
} from '../../middleware/auth';
import { AuthController } from './auth.controller';
import { requireVerifiedEmail } from '../../middleware/access';

const r = Router();

r.post('/register', ...AuthController.register);
r.post('/login', ...AuthController.login);
r.post('/login/local', localAuth, AuthController.handleLoginSuccess);

r.get('/google', googleAuth);
r.get('/google/callback', googleAuthCallback, AuthController.handleOAuthCallback);

r.get('/github', githubAuth);
r.get('/github/callback', githubAuthCallback, AuthController.handleOAuthCallback);

r.post('/refresh', ...AuthController.refreshToken);

// защищённые зоны
r.post('/logout', jwtAuth, requireVerifiedEmail, AuthController.logout);
r.get('/me', jwtAuth, requireVerifiedEmail, AuthController.getCurrentUser);
r.patch('/profile', jwtAuth, requireVerifiedEmail, ...AuthController.updateProfile);
r.post('/change-password', jwtAuth, requireVerifiedEmail, ...AuthController.changePassword);

// email-verify
r.get('/verify-email', AuthController.verifyEmail);
r.post('/resend-verification', ...AuthController.resendVerification);
r.post('/request-password-reset', ...AuthController.requestPasswordReset);
r.post('/reset-password', ...AuthController.resetPassword);

export default r;
