import { Request, RequestHandler } from 'express';
import { authService } from './auth.service';
import { jwtService } from 'jwt/jwt.service';
import { isAuthenticatedRequest } from '../../utils/typeGuards';
import { userService } from 'users/user.service';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/async-handler';
import { config } from '../../config';
import { SessionContext } from './refresh-session.types';
import {
  changePasswordSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  requestPasswordResetSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  sessionIdParamSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from './auth.schema';
import { AUTH_MESSAGES } from './auth.constants';

// Только для отображения в списке "активные сессии" (GET /sessions) — не для проверок
// безопасности, UA/IP подделываются (см. refresh-session.types.ts). Один хелпер на все
// точки выдачи/обмена сессии (login/login-local/OAuth/refresh), чтобы ни одна не забыла его.
function sessionContext(req: Request): SessionContext {
  return {
    userAgent: req.get('user-agent')?.slice(0, 256) ?? null,
    ip: req.ip ?? null,
  };
}

export const register: RequestHandler = async (req, res) => {
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
};

export const login: RequestHandler = async (req, res) => {
  const { email, password } = req.body;
  const { user, accessToken, refreshToken } = await authService.login(email, password, sessionContext(req));

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
};

export const handleLoginSuccess: RequestHandler = async (req, res) => {
  if (!req.user || !authService.isValidUser(req.user)) {
    res.status(401).json({ error: AUTH_MESSAGES.ERROR.AUTH_FAILED });
    return;
  }

  const { accessToken, refreshToken } = await authService.issueTokensFor(req.user, sessionContext(req));

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
};

export const handleOAuthCallback: RequestHandler = async (req, res) => {
  // Редиректим на config.frontendUrl, а не на относительный путь: относительный '/'
  // браузер разрешает относительно ТЕКУЩЕГО origin — а после OAuth-редиректа текущий
  // origin это сам Express (localhost:3000), не фронтенд (localhost:3001 в dev,
  // на проде — тот же домен, но за Ingress-путём '/', тоже не совпадает 1:1 с API).
  if (!req.user || !authService.isValidUser(req.user)) {
    res.redirect(`${config.frontendUrl}/login?error=auth_failed`);
    return;
  }

  const { accessToken, refreshToken } = await authService.issueTokensFor(req.user, sessionContext(req));

  jwtService.setTokensCookies(res, accessToken, refreshToken);

  res.redirect(config.frontendUrl);
};

export const logout: RequestHandler = async (req, res) => {
  // isAuthenticatedRequest не проверяем строго — logout должен отработать даже с уже
  // протухшим/отсутствующим access-токеном (jwtAuth на роуте это в норме отсечёт раньше,
  // но best-effort revokeByToken внутри authService.logout и так не бросает исключений).
  if (isAuthenticatedRequest(req)) {
    await authService.logout(req.user._id.toString(), req.cookies?.refresh_token);
  }

  jwtService.clearTokensCookies(res);
  res.json({ message: AUTH_MESSAGES.SUCCESS.LOGGED_OUT });
};

export const logoutAll: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
    return;
  }

  await authService.logoutAll(req.user._id.toString());
  jwtService.clearTokensCookies(res);
  res.json({ message: AUTH_MESSAGES.SUCCESS.LOGGED_OUT });
};

export const getSessions: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
    return;
  }

  const sessions = await authService.listSessions(req.user._id.toString(), req.cookies?.refresh_token);
  res.json({ sessions });
};

export const deleteSession: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
    return;
  }

  await authService.revokeSession(req.user._id.toString(), req.params.id);
  res.status(204).send();
};

export const refreshToken: RequestHandler = async (req, res) => {
  const { refreshToken: bodyRefreshToken } = req.body;
  const cookieRefreshToken = req.cookies?.refresh_token;
  const refreshToken = bodyRefreshToken || cookieRefreshToken;

  if (!refreshToken) {
    res.status(401).json({ error: AUTH_MESSAGES.ERROR.REFRESH_TOKEN_REQUIRED });
    return;
  }

  const {
    user,
    accessToken,
    refreshToken: newRefreshToken,
  } = await authService.refreshTokens(refreshToken, sessionContext(req));

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
};

export const getCurrentUser: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
    return;
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
};

export const updateProfile: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
    return;
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
};

export const changePassword: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    res.status(401).json({ error: AUTH_MESSAGES.ERROR.UNAUTHORIZED });
    return;
  }

  const { currentPassword, newPassword } = req.body;

  await authService.changePassword(req.user._id.toString(), currentPassword, newPassword, req.cookies?.refresh_token);

  res.json({ message: AUTH_MESSAGES.SUCCESS.PASSWORD_CHANGED });
};

export const verifyEmail: RequestHandler = async (req, res) => {
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
};

export const resendVerification: RequestHandler = async (req, res) => {
  const { email } = req.body;

  await authService.resendVerificationEmail(email);

  res.json({
    message: 'Письмо с подтверждением отправлено повторно',
  });
};

export const requestPasswordReset: RequestHandler = async (req, res) => {
  const { email } = req.body;

  await authService.requestPasswordReset(email);

  res.json({
    message: 'Если email зарегистрирован, письмо для сброса пароля будет отправлено',
  });
};

export const resetPassword: RequestHandler = async (req, res) => {
  const { token, newPassword } = req.body;

  await authService.resetPassword(token, newPassword);

  res.json({
    message: 'Пароль успешно изменен',
  });
};

// Экспорт с валидацией для использования в routes
export const AuthController = {
  register: [validate(registerSchema), asyncHandler(register)],
  login: [validate(loginSchema), asyncHandler(login)],
  handleLoginSuccess: asyncHandler(handleLoginSuccess),
  handleOAuthCallback: asyncHandler(handleOAuthCallback),
  logout: asyncHandler(logout),
  logoutAll: asyncHandler(logoutAll),
  getSessions: asyncHandler(getSessions),
  deleteSession: [validate(sessionIdParamSchema), asyncHandler(deleteSession)],
  refreshToken: [validate(refreshTokenSchema), asyncHandler(refreshToken)],
  getCurrentUser: asyncHandler(getCurrentUser),
  updateProfile: [validate(updateProfileSchema), asyncHandler(updateProfile)],
  changePassword: [validate(changePasswordSchema), asyncHandler(changePassword)],
  verifyEmail: [validate(verifyEmailSchema), asyncHandler(verifyEmail)],
  resendVerification: [validate(resendVerificationSchema), asyncHandler(resendVerification)],
  requestPasswordReset: [validate(requestPasswordResetSchema), asyncHandler(requestPasswordReset)],
  resetPassword: [validate(resetPasswordSchema), asyncHandler(resetPassword)],
};
