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

export default r;
