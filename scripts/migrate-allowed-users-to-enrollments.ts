// Разовая миграция: Course.allowedUsers[] (embedded-массив) → отдельная коллекция Enrollment.
// Само поле уже выведено из Mongoose-схемы (см. course.model.ts) — Course.find() тихо не
// отдал бы его, даже если оно физически ещё лежит в уже существующих документах, поэтому
// читаем напрямую через нативный драйвер коллекции, в обход CourseModel.
//
// Как использовать (один раз, после деплоя ветки 39_enrollments-module):
//   npm run migrate:enrollments
import mongoose from 'mongoose';
import { config } from '../src/config';
import { EnrollmentModel } from '../src/modules/enrollments/enrollment.model';
import { CourseModel } from '../src/modules/courses/course.model';

type LegacyCourse = {
  _id: mongoose.Types.ObjectId;
  allowedUsers?: mongoose.Types.ObjectId[];
};

async function main(): Promise<void> {
  await mongoose.connect(config.mongoUri);
  const coursesCollection = mongoose.connection.collection<LegacyCourse>('courses');

  try {
    const courses = await coursesCollection
      .find({ allowedUsers: { $exists: true, $ne: [] } }, { projection: { allowedUsers: 1 } })
      .toArray();

    console.log(`Найдено курсов с непустым allowedUsers: ${courses.length}`);

    let migratedPairs = 0;

    for (const course of courses) {
      // Set по строковому представлению — на случай исторических дублей в allowedUsers
      // (не должно было накопиться, $addToSet в старом course.repository.ts это предотвращал,
      // но миграция — не то место, где стоит полагаться на прошлую гарантию без проверки).
      const uniqueUserIds = [...new Map((course.allowedUsers ?? []).map(id => [id.toString(), id])).values()];

      for (const userId of uniqueUserIds) {
        // $setOnInsert — если пара уже как-то существует (повторный прогон скрипта), не трогаем
        // её status/enrolledAt; upsert делает миграцию идемпотентной при повторном запуске.
        await EnrollmentModel.updateOne(
          { courseId: course._id, userId },
          { $setOnInsert: { courseId: course._id, userId, status: 'active', enrolledAt: new Date() } },
          { upsert: true }
        );
        migratedPairs += 1;
      }

      await CourseModel.updateOne({ _id: course._id }, { $set: { studentsCount: uniqueUserIds.length } });
    }

    console.log(`Перенесено пар курс+пользователь: ${migratedPairs}`);

    const unsetResult = await coursesCollection.updateMany(
      { allowedUsers: { $exists: true } },
      { $unset: { allowedUsers: '' } }
    );
    console.log(`allowedUsers удалено из документов: ${unsetResult.modifiedCount}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error('Ошибка миграции:', error);
  process.exit(1);
});
