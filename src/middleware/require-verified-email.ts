import { NextFunction, Request, Response } from 'express';
import { USER_MESSAGES } from 'users/user.constants';
import { isAuthenticatedRequest } from '../utils/typeGuards';
import { COMMON_MESSAGES } from '../shared/constants/messages';

export const requireVerifiedEmail = (req: Request, res: Response, next: NextFunction) => {
  if (!isAuthenticatedRequest(req)) {
    return res.status(401).json({
      error: COMMON_MESSAGES.ERROR.UNAUTHORIZED, // Используем из COMMON_MESSAGES
    });
  }

  if (!req.user.isEmailVerified && req.user.role !== 'admin') {
    return res.status(403).json({
      error: USER_MESSAGES.ERROR.EMAIL_NOT_VERIFIED,
      requiresVerification: true,
      message: USER_MESSAGES.INFO.VERIFICATION_REQUIRED,
    });
  }

  next();
};
