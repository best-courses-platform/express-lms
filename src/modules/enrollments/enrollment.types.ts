import { Types } from 'mongoose';

// 'revoked' вместо удаления документа при отзыве доступа — сохраняет историю "кто и когда
// был записан/отчислен", а не только текущий снимок. Заодно даёт естественный upsert-путь
// повторной записи после отзыва (флип того же документа обратно в 'active'), см. enrollment.model.ts.
export type EnrollmentStatus = 'active' | 'revoked';

export type Enrollment = {
  _id: Types.ObjectId;
  courseId: Types.ObjectId;
  userId: Types.ObjectId;
  status: EnrollmentStatus;
  enrolledAt: Date;
};
