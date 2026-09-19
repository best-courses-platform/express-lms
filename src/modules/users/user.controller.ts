import { RequestHandler } from 'express';
import { userService } from './user.service';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/async-handler';
import { createUserSchema, idParamSchema, updateUserSchema } from './user.schema';
import { USER_MESSAGES } from './user.constants';
import { emailService } from 'email/email.service';
import { enqueueVerificationEmail } from 'email/email.queue';

export const createUser: RequestHandler = async (req, res) => {
  const { user, emailVerificationToken } = await userService.create(req.body);

  // Отправляем email для подтверждения (токен есть только у локальной регистрации, не у OAuth)
  if (emailVerificationToken && emailService.isConfigured()) {
    await enqueueVerificationEmail(user.email, emailVerificationToken, user.name);
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
  const before = await userService.getById(req.params.id);
  const updated = await userService.update(req.params.id, req.body);

  // Если изменили email, подтверждение сброшено — выдаём новый токен и отправляем письмо.
  // (Раньше сравнивали req.body.email с updated.email — они равны после обновления, письмо
  // не уходило никогда, а токен читался из документа, из которого он вырезан .select().)
  if (updated.email !== before.email && emailService.isConfigured()) {
    const token = await userService.issueEmailVerificationToken(updated._id.toString());
    await enqueueVerificationEmail(updated.email, token, updated.name);
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
