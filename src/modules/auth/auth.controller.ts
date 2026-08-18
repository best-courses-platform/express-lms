// domains/auth/auth.controller.ts
import { RequestHandler } from 'express';
import { authService } from './auth.service';
import { jwtService } from 'jwt/jwt.service';
import { isAuthenticatedRequest } from '../../utils/typeGuards';
import { userService } from 'users/user.service';
import { validate } from '../../middleware/validate';
import { config } from '../../config';
import {
  changePasswordSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  requestPasswordResetSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from './auth.schema';
import { AUTH_MESSAGES } from './auth.constants';

export const register: RequestHandler = async (req, res, next) => {
  try {
    const { user } = await authService.register(req.body);

    // Без токенов и без cookie — email ещё не подтверждён, рабочей сессии быть не должно
    // (симметрично тому, что login() требует подтверждённый email). Войти можно только
    // после POST /api/auth/verify-email, затем обычным POST /api/auth/login.
    res.status(201).json({
      message: AUTH_MESSAGES.SUCCESS.REGISTERED,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { user, accessToken, refreshToken } = await authService.login(email, password);

    jwtService.setTokensCookies(res, accessToken, refreshToken);

    res.json({
      message: AUTH_MESSAGES.SUCCESS.LOGGED_IN,
      token: accessToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
      },
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

    jwtService.setTokensCookies(res, accessToken, refreshToken);

    res.json({
      message: AUTH_MESSAGES.SUCCESS.LOGGED_IN,
      token: accessToken,
      user: {
        id: req.user._id.toString(),
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const handleOAuthCallback: RequestHandler = async (req, res, next) => {
  try {
    // Редиректим на config.frontendUrl, а не на относительный путь: относительный '/'
    // браузер разрешает относительно ТЕКУЩЕГО origin — а после OAuth-редиректа текущий
    // origin это сам Express (localhost:3000), не фронтенд (localhost:3001 в dev,
    // на проде — тот же домен, но за Ingress-путём '/', тоже не совпадает 1:1 с API).
    if (!req.user || !authService.isValidUser(req.user)) {
      res.redirect(`${config.frontendUrl}/login?error=auth_failed`);
      return;
    }

    const accessToken = authService.generateAccessToken(req.user);
    const refreshToken = authService.generateRefreshToken(req.user);

    jwtService.setTokensCookies(res, accessToken, refreshToken);

    res.redirect(config.frontendUrl);
  } catch (error) {
    next(error);
  }
};

export const logout: RequestHandler = async (req, res, next) => {
  try {
    jwtService.clearTokensCookies(res);
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

    jwtService.setTokensCookies(res, accessToken, newRefreshToken);

    res.json({
      message: AUTH_MESSAGES.SUCCESS.TOKENS_REFRESHED,
      token: accessToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
      },
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
        updatedAt: req.user.updatedAt,
      },
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
        updatedAt: updatedUser.updatedAt,
      },
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

    await authService.changePassword(req.user._id.toString(), currentPassword, newPassword);

    res.json({ message: AUTH_MESSAGES.SUCCESS.PASSWORD_CHANGED });
  } catch (error) {
    next(error);
  }
};

export const verifyEmail: RequestHandler = async (req, res, next) => {
  try {
    const { token } = req.body;

    const user = await authService.verifyEmail(token);

    res.json({
      message: 'Email успешно подтвержден!',
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const resendVerification: RequestHandler = async (req, res, next) => {
  try {
    const { email } = req.body;

    await authService.resendVerificationEmail(email);

    res.json({
      message: 'Письмо с подтверждением отправлено повторно',
    });
  } catch (error) {
    next(error);
  }
};

export const requestPasswordReset: RequestHandler = async (req, res, next) => {
  try {
    const { email } = req.body;

    await authService.requestPasswordReset(email);

    res.json({
      message: 'Если email зарегистрирован, письмо для сброса пароля будет отправлено',
    });
  } catch (error) {
    next(error);
  }
};

export const resetPassword: RequestHandler = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    await authService.resetPassword(token, newPassword);

    res.json({
      message: 'Пароль успешно изменен',
    });
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
  changePassword: [validate(changePasswordSchema), changePassword],
  verifyEmail: [validate(verifyEmailSchema), verifyEmail],
  resendVerification: [validate(resendVerificationSchema), resendVerification],
  requestPasswordReset: [validate(requestPasswordResetSchema), requestPasswordReset],
  resetPassword: [validate(resetPasswordSchema), resetPassword],
};
