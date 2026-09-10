import { z } from 'zod';
import { ENROLLMENT_MESSAGES } from './enrollment.constants';
import { objectIdSchema } from '../../shared/validation/object-id.schema';

const courseIdParam = objectIdSchema(
  ENROLLMENT_MESSAGES.VALIDATION.COURSE_ID_REQUIRED,
  ENROLLMENT_MESSAGES.VALIDATION.COURSE_ID_INVALID
);
const userIdParam = objectIdSchema(
  ENROLLMENT_MESSAGES.VALIDATION.USER_ID_REQUIRED,
  ENROLLMENT_MESSAGES.VALIDATION.USER_ID_INVALID
);

export const enrollSchema = z.object({
  params: z.object({
    id: courseIdParam,
  }),
  body: z.object({
    email: z.string().email(ENROLLMENT_MESSAGES.VALIDATION.EMAIL_INVALID).min(
      1,
      ENROLLMENT_MESSAGES.VALIDATION.EMAIL_REQUIRED
    ),
  }),
});

export const unenrollSchema = z.object({
  params: z.object({
    id: courseIdParam,
    userId: userIdParam,
  }),
});

export const listStudentsSchema = z.object({
  params: z.object({
    id: courseIdParam,
  }),
});

export type EnrollInput = z.infer<typeof enrollSchema>['body'];
export type UnenrollParams = z.infer<typeof unenrollSchema>['params'];
