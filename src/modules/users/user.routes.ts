// import { Router } from 'express';
// import { UserController } from './user.controller';
//
// const usersRoutes = Router();
//
// // Основные CRUD операции (обычно для админ-панели)
// usersRoutes.post('/', ...UserController.createUser);
// usersRoutes.get('/', UserController.listUsers);
// usersRoutes.get('/:id', ...UserController.getUser);
// usersRoutes.patch('/:id', ...UserController.updateUser);
// usersRoutes.delete('/:id', ...UserController.deleteUser);
//
// // Маршруты для подтверждения email и сброса пароля
// usersRoutes.get('/verify-email', ...UserController.verifyEmail);
// usersRoutes.post('/resend-verification', ...UserController.resendVerification);
// usersRoutes.post('/request-password-reset', ...UserController.requestPasswordReset);
// usersRoutes.post('/reset-password', ...UserController.resetPassword);
//
// // usersRoutes.post('/', jwtAuth, requireVerifiedEmail, ...UserController.createUser);
//
// export default usersRoutes;

import { Router } from 'express';
import { UserController } from './user.controller';
import { jwtAuth } from '../../middleware/auth';
import { requireRole, requireVerifiedEmail } from '../../middleware/access';

const r = Router();

// только админ
r.post('/', jwtAuth, requireVerifiedEmail, requireRole(['admin']), ...UserController.createUser);
r.get('/', jwtAuth, requireVerifiedEmail, requireRole(['admin']), UserController.listUsers);

r.get('/:id', jwtAuth, requireVerifiedEmail, requireRole(['admin']), ...UserController.getUser);
r.patch('/:id', jwtAuth, requireVerifiedEmail, requireRole(['admin']), ...UserController.updateUser);
r.delete('/:id', jwtAuth, requireVerifiedEmail, requireRole(['admin']), ...UserController.deleteUser);

// публичные системные
r.get('/verify-email', ...UserController.verifyEmail);
r.post('/resend-verification', ...UserController.resendVerification);
r.post('/request-password-reset', ...UserController.requestPasswordReset);
r.post('/reset-password', ...UserController.resetPassword);

export default r;
