import { RequestHandler } from 'express';
import { userService } from './user.service';
import { validate } from '../../middleware/validate';
import {
  createUserSchema,
  idParamSchema,
  requestPasswordResetSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  updateUserSchema,
  verifyEmailSchema,
} from './user.schema';
import { USER_MESSAGES } from './user.constants';
import { emailService } from 'email/email.service';

export const createUser: RequestHandler = async (req, res, next) => {
  try {
    const user = await userService.create(req.body);

    // Отправляем email для подтверждения (если не OAuth)
    if (!user.googleId && !user.githubId && emailService.isConfigured()) {
      await emailService.sendVerificationEmail(user.email, user.emailVerificationToken!, user.name);
    }

    res.status(201).json({
      message: USER_MESSAGES.SUCCESS.USER_CREATED,
      user,
    });
  } catch (e) {
    next(e);
  }
};

export const listUsers: RequestHandler = async (_req, res, next) => {
  try {
    const users = await userService.list();
    res.json(users);
  } catch (e) {
    next(e);
  }
};

export const getUser: RequestHandler = async (req, res, next) => {
  try {
    const user = await userService.getById(req.params.id);
    res.json(user);
  } catch (e) {
    next(e);
  }
};

export const updateUser: RequestHandler = async (req, res, next) => {
  try {
    const updated = await userService.update(req.params.id, req.body);

    // Если изменили email, отправляем письмо с подтверждением
    if (req.body.email && req.body.email !== updated.email && emailService.isConfigured()) {
      await emailService.sendVerificationEmail(updated.email, updated.emailVerificationToken!, updated.name);
    }

    res.json({
      message: USER_MESSAGES.SUCCESS.USER_UPDATED,
      user: updated,
    });
  } catch (e) {
    next(e);
  }
};

export const deleteUser: RequestHandler = async (req, res, next) => {
  try {
    await userService.delete(req.params.id);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
};

// Добавляем новые контроллеры для подтверждения email
export const verifyEmail: RequestHandler = async (req, res, next) => {
  try {
    const { token } = req.query as { token: string };
    const user = await userService.verifyEmail(token);

    res.json({
      message: USER_MESSAGES.SUCCESS.EMAIL_VERIFIED,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (e) {
    next(e);
  }
};

export const resendVerification: RequestHandler = async (req, res, next) => {
  try {
    const { email } = req.body;

    await userService.resendVerificationEmail(email);

    // Отправляем письмо с подтверждением
    if (emailService.isConfigured()) {
      const user = await userService.getUserByEmail(email);
      if (user && user.emailVerificationToken) {
        await emailService.sendVerificationEmail(user.email, user.emailVerificationToken, user.name);
      }
    }

    res.json({
      message: USER_MESSAGES.SUCCESS.VERIFICATION_EMAIL_SENT,
    });
  } catch (e) {
    next(e);
  }
};

export const requestPasswordReset: RequestHandler = async (req, res, next) => {
  try {
    const { email } = req.body;

    await userService.requestPasswordReset(email);

    // Отправляем письмо с инструкциями
    if (emailService.isConfigured()) {
      const user = await userService.getUserByEmailWithPassword(email);
      if (user && user.passwordResetToken) {
        await emailService.sendPasswordResetEmail(user.email, user.passwordResetToken, user.name);
      }
    }

    res.json({
      message: USER_MESSAGES.SUCCESS.PASSWORD_RESET_SENT,
    });
  } catch (e) {
    next(e);
  }
};

export const resetPassword: RequestHandler = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    await userService.resetPassword(token, newPassword);

    res.json({
      message: USER_MESSAGES.SUCCESS.PASSWORD_RESET,
    });
  } catch (e) {
    next(e);
  }
};

// Экспорт с валидацией для использования в routes
export const UserController = {
  createUser: [validate(createUserSchema), createUser],
  listUsers,
  getUser: [validate(idParamSchema, 'params'), getUser],
  updateUser: [validate(updateUserSchema), updateUser],
  deleteUser: [validate(idParamSchema, 'params'), deleteUser],
  verifyEmail: [validate(verifyEmailSchema, 'query'), verifyEmail],
  resendVerification: [validate(resendVerificationSchema), resendVerification],
  requestPasswordReset: [validate(requestPasswordResetSchema), requestPasswordReset],
  resetPassword: [validate(resetPasswordSchema), resetPassword],
};
