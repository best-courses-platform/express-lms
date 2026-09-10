import { RequestHandler } from 'express';
import { enrollmentService } from './enrollment.service';
import { UnauthorizedError } from '../../utils/errors';
import { isAuthenticatedRequest, getUserIdFromRequest } from '../../utils/typeGuards';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/async-handler';
import { enrollSchema, unenrollSchema, listStudentsSchema } from './enrollment.schema';
import { ENROLLMENT_MESSAGES } from './enrollment.constants';

export const enroll: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    throw new UnauthorizedError(ENROLLMENT_MESSAGES.ERROR.UNAUTHORIZED);
  }
  const authorId = getUserIdFromRequest(req);
  const enrollment = await enrollmentService.enrollByEmail(req.params.id, req.body.email, authorId);
  res.status(201).json({
    message: ENROLLMENT_MESSAGES.SUCCESS.ENROLLED,
    enrollment,
  });
};

export const unenroll: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    throw new UnauthorizedError(ENROLLMENT_MESSAGES.ERROR.UNAUTHORIZED);
  }
  const authorId = getUserIdFromRequest(req);
  await enrollmentService.unenroll(req.params.id, req.params.userId, authorId);
  res.json({ message: ENROLLMENT_MESSAGES.SUCCESS.UNENROLLED });
};

export const listStudents: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    throw new UnauthorizedError(ENROLLMENT_MESSAGES.ERROR.UNAUTHORIZED);
  }
  const authorId = getUserIdFromRequest(req);
  const students = await enrollmentService.listStudents(req.params.id, authorId);
  res.json(students);
};

export const EnrollmentController = {
  enroll: [validate(enrollSchema), asyncHandler(enroll)],
  unenroll: [validate(unenrollSchema), asyncHandler(unenroll)],
  listStudents: [validate(listStudentsSchema), asyncHandler(listStudents)],
};
