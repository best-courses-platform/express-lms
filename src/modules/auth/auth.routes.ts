// domains/auth/auth.routes.ts
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
import { authRateLimiter } from '../../middleware/rate-limit';

const r = Router();

// authRateLimiter() — на всё, что позволяет перебирать пароли/email (brute-force, user
// enumeration): вход, регистрация, рефреш, верификация/сброс пароля. verify-email/reset-password
// сюда же — токен непредсказуем (256 бит), но лимит не помешает и этим роутам.
// Каждый вызов authRateLimiter() — отдельный бюджет; /login и /login/local — два пути к одному
// и тому же действию (подбор пароля), поэтому у них один общий лимитер, не два независимых.
const loginRateLimiter = authRateLimiter();

r.post('/register', authRateLimiter(), ...AuthController.register);
r.post('/login', loginRateLimiter, ...AuthController.login);
r.post('/login/local', loginRateLimiter, localAuth, AuthController.handleLoginSuccess);

r.get('/google', googleAuth);
r.get('/google/callback', googleAuthCallback, AuthController.handleOAuthCallback);

r.get('/github', githubAuth);
r.get('/github/callback', githubAuthCallback, AuthController.handleOAuthCallback);

r.post('/refresh', authRateLimiter(), ...AuthController.refreshToken);

// защищённые зоны
r.post('/logout', jwtAuth, requireVerifiedEmail, AuthController.logout);
r.get('/me', jwtAuth, requireVerifiedEmail, AuthController.getCurrentUser);
r.patch('/profile', jwtAuth, requireVerifiedEmail, ...AuthController.updateProfile);
r.post('/change-password', jwtAuth, requireVerifiedEmail, ...AuthController.changePassword);

// email-verify
r.post('/verify-email', authRateLimiter(), ...AuthController.verifyEmail);
r.post('/resend-verification', authRateLimiter(), ...AuthController.resendVerification);
r.post('/request-password-reset', authRateLimiter(), ...AuthController.requestPasswordReset);
r.post('/reset-password', authRateLimiter(), ...AuthController.resetPassword);

export default r;
