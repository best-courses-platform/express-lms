import { RequestHandler } from 'express';
import { userService } from './user.service';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/async-handler';
import { createUserSchema, idParamSchema, updateUserSchema } from './user.schema';
import { USER_MESSAGES } from './user.constants';
import { emailService } from 'email/email.service';
import { enqueueVerificationEmail } from 'email/email.queue';

export const createUser: RequestHandler = async (req, res) => {
  const user = await userService.create(req.body);

  // Отправляем email для подтверждения (если не OAuth)
  if (!user.googleId && !user.githubId && emailService.isConfigured()) {
    await enqueueVerificationEmail(user.email, user.emailVerificationToken!, user.name);
  }

  res.status(201).json({
    message: USER_MESSAGES.SUCCESS.USER_CREATED,
    user,
  });
};

export const listUsers: RequestHandler = async (_req, res) => {
  const users = await userService.list();
  res.json(users);
};

export const getUser: RequestHandler = async (req, res) => {
  const user = await userService.getById(req.params.id);
  res.json(user);
};

export const updateUser: RequestHandler = async (req, res) => {
  const updated = await userService.update(req.params.id, req.body);

  // Если изменили email, отправляем письмо с подтверждением
  if (req.body.email && req.body.email !== updated.email && emailService.isConfigured()) {
    await enqueueVerificationEmail(updated.email, updated.emailVerificationToken!, updated.name);
  }

  res.json({
    message: USER_MESSAGES.SUCCESS.USER_UPDATED,
    user: updated,
  });
};

export const deleteUser: RequestHandler = async (req, res) => {
  await userService.delete(req.params.id);
  res.status(204).send();
};

// Экспорт с валидацией для использования в routes
export const UserController = {
  createUser: [validate(createUserSchema), asyncHandler(createUser)],
  listUsers: asyncHandler(listUsers),
  getUser: [validate(idParamSchema, 'params'), asyncHandler(getUser)],
  updateUser: [validate(updateUserSchema), asyncHandler(updateUser)],
  deleteUser: [validate(idParamSchema, 'params'), asyncHandler(deleteUser)],
};
