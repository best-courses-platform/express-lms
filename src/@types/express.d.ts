// src/@types/express.d.ts
/* eslint-disable @typescript-eslint/no-empty-object-type */
import {User as AppUser} from 'users/user.types';

declare global {
  namespace Express {
    interface User extends AppUser {}

    interface Request {
      user?: User;
      validatedData?: unknown;
    }
  }
}
