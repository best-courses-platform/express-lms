import { Course, NewCourse, Rating, UpdateCourse } from './course.types';
import { CourseModel } from './course.model';
import { RatingModel } from './rating.model';
import mongoose, { Types } from 'mongoose';

class CourseRepository {
  async create(input: NewCourse): Promise<Course> {
    const course = new CourseModel(input);
    return await course.save();
  }

  // Списочные методы ниже намеренно НЕ populate('lessons', ...) — раньше тянули title/duration
  // каждого урока каждого курса на каждый запрос каталога, хотя карточке курса в списке нужно
  // только количество (lessonsCount — обычное поле, без join). Полный список уроков —
  // только там, где он реально нужен и запрашивается по одному курсу: findById().
  // См. Obsidian: "Обход ORM на горячих путях" — денормализация counter-полем вместо
  // join'а на каждое чтение списка.
  async findAll(): Promise<Course[]> {
    return await CourseModel.find().populate('author', 'name email avatar').exec();
  }

  async findById(id: string): Promise<Course | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return await CourseModel.findById(id)
      .populate('author', 'name email avatar')
      .populate('lessons', 'title duration description')
      .exec();
  }

  async findByTitle(title: string): Promise<Course | null> {
    return await CourseModel.findOne({ title }).exec();
  }

  async findByAuthor(authorId: string): Promise<Course[]> {
    if (!Types.ObjectId.isValid(authorId)) {
      return [];
    }
    return await CourseModel.find({ author: authorId }).populate('author', 'name email avatar').exec();
  }

  /**
   * По списку id — источник для getMyCourses (роль student): курсы приходят из
   * enrollmentService.getEnrolledCourseIds, здесь только материализуем сами документы.
   */
  async findByIds(ids: Types.ObjectId[]): Promise<Course[]> {
    if (ids.length === 0) {
      return [];
    }
    return await CourseModel.find({ _id: { $in: ids } })
      .populate('author', 'name email avatar')
      .exec();
  }

  async findByDifficulty(difficulty: string): Promise<Course[]> {
    return await CourseModel.find({ difficulty }).populate('author', 'name email avatar').exec();
  }

  async findPublished(): Promise<Course[]> {
    return await CourseModel.find({ isPublished: true })
      .populate('author', 'name email avatar')
      .sort({ createdAt: -1 })
      .exec();
  }

  // $text — нативный полнотекстовый поиск MongoDB поверх индекса title/description
  // (course.model.ts), а не постраничная выборка всех курсов с фильтрацией по подстроке
  // в Node. Ограничен опубликованными курсами — это поиск по публичному каталогу,
  // не админский инструмент. $meta: 'textScore' — релевантность считает сам движок БД.
  async search(query: string): Promise<Course[]> {
    return await CourseModel.find({ $text: { $search: query }, isPublished: true }, { score: { $meta: 'textScore' } })
      .populate('author', 'name email avatar')
      .sort({ score: { $meta: 'textScore' } })
      .exec();
  }

  async update(id: string, patch: UpdateCourse): Promise<Course> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error('Invalid course ID');
    }

    const updatedCourse = await CourseModel.findByIdAndUpdate(id, { ...patch }, { new: true, runValidators: true })
      .populate('author', 'name email avatar')
      .exec();

    if (!updatedCourse) {
      throw new Error('Course not found');
    }

    return updatedCourse;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      return false;
    }

    const result = await CourseModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  async addLesson(courseId: string, lessonId: Types.ObjectId): Promise<Course> {
    if (!Types.ObjectId.isValid(courseId)) {
      throw new Error('Invalid course ID');
    }

    // $inc в той же атомарной операции, что и $push — lessonsCount не может разойтись
    // с реальной длиной lessons[] (не отдельный round-trip, не пересчёт в Node).
    const updatedCourse = await CourseModel.findByIdAndUpdate(
      courseId,
      { $push: { lessons: lessonId }, $inc: { lessonsCount: 1 } },
      { new: true, runValidators: true }
    )
      .populate('author', 'name email avatar')
      .exec();

    if (!updatedCourse) {
      throw new Error('Course not found');
    }

    return updatedCourse;
  }

  async removeLesson(courseId: string, lessonId: Types.ObjectId): Promise<Course> {
    if (!Types.ObjectId.isValid(courseId)) {
      throw new Error('Invalid course ID');
    }

    const updatedCourse = await CourseModel.findByIdAndUpdate(
      courseId,
      { $pull: { lessons: lessonId }, $inc: { lessonsCount: -1 } },
      { new: true, runValidators: true }
    )
      .populate('author', 'name email avatar')
      .exec();

    if (!updatedCourse) {
      throw new Error('Course not found');
    }

    return updatedCourse;
  }

  // Раньше: findById (весь курс) + $pull + $push + JS-reduce по всему ratings[] + ещё один
  // findByIdAndUpdate — 4 последовательных round-trip'а на одну оценку, плюс окно гонки
  // между чтением ratings и записью пересчитанного average (конкурентный запрос от другого
  // пользователя мог влезть между ними и "потеряться" из среднего). См. Obsidian:
  // "Обход ORM на горячих путях".
  //
  // Теперь — upsert в отдельную коллекцию Rating (unique-индекс courseId+userId делает
  // "одна оценка на пользователя" гарантией уровня БД) + pipeline-update Course ($inc
  // суммы/счётчика и пересчёт average одной операцией на стороне MongoDB), обе — без
  // предварительного чтения всего массива оценок. Обёрнуты в session.withTransaction():
  // либо применяются обе операции, либо ни одна — падение процесса между ними больше не
  // может развести ratingSum/ratingCount с реальными Rating-документами (см. Obsidian:
  // раньше здесь был compromise "два раздельных документа без транзакции", закрыт
  // переводом dev-Mongo на replica set — см. /etc/mongodb.conf, replication.replSetName).
  //
  // .populate() ниже НЕ наследует session родительского запроса автоматически (Mongoose
  // явно прокидывает в populate только readConcern/readPreference/lean, не session —
  // видно в исходниках query.js) — передан отдельно через options.session, иначе populate
  // читал бы вне транзакции.
  async addRating(
    courseId: string,
    rating: { userId: Types.ObjectId; value: number; createdAt: Date }
  ): Promise<Course> {
    if (!Types.ObjectId.isValid(courseId)) {
      throw new Error('Invalid course ID');
    }

    const courseObjectId = new Types.ObjectId(courseId);
    let updatedCourse: Course | null = null;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // new: false — возвращает состояние ДО апдейта (null, если оценки ещё не было),
        // чтобы посчитать дельту, не читая ratingSum/ratingCount курса отдельным запросом.
        const previousRating = await RatingModel.findOneAndUpdate(
          { courseId: courseObjectId, userId: rating.userId },
          { $set: { value: rating.value, createdAt: rating.createdAt } },
          { upsert: true, new: false, setDefaultsOnInsert: true, session }
        ).exec();

        const valueDelta = rating.value - (previousRating?.value ?? 0);
        const countDelta = previousRating ? 0 : 1;

        updatedCourse = await CourseModel.findByIdAndUpdate(
          courseObjectId,
          [
            {
              // $ifNull — курсы, созданные до появления ratingSum/ratingCount в схеме
              // (миграция полей не задним числом не проставляет их в уже сохранённых
              // документах — дефолты Mongoose применяются только при создании через
              // Mongoose, а не когда сервер сам выполняет pipeline-update на "сырых" BSON).
              // Без guard'а $add на отсутствующем поле молча возвращает null, и он
              // каскадом убивает averageRating на следующем шаге — поймано вручную на
              // реальном dev-курсе при smoke-тесте, не гипотетический риск.
              $set: {
                ratingSum: { $add: [{ $ifNull: ['$ratingSum', 0] }, valueDelta] },
                ratingCount: { $add: [{ $ifNull: ['$ratingCount', 0] }, countDelta] },
              },
            },
            {
              $set: {
                averageRating: {
                  $cond: [
                    { $eq: ['$ratingCount', 0] },
                    0,
                    { $round: [{ $divide: ['$ratingSum', '$ratingCount'] }, 1] },
                  ],
                },
              },
            },
          ],
          { new: true, session }
        )
          .populate({ path: 'author', select: 'name email avatar', options: { session } })
          .exec();

        if (!updatedCourse) {
          throw new Error('Course not found');
        }
      });
    } finally {
      await session.endSession();
    }

    if (!updatedCourse) {
      throw new Error('Course not found');
    }

    return updatedCourse;
  }

  async getRatingsByCourse(courseId: string): Promise<Rating[]> {
    if (!Types.ObjectId.isValid(courseId)) {
      return [];
    }
    return await RatingModel.find({ courseId: new Types.ObjectId(courseId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Удаление курса — вызывается ДО CourseModel.findByIdAndDelete в courseService.delete().
   * Сам курс (со своими ratingSum/ratingCount) через мгновение исчезнет целиком — просто
   * deleteMany, без пересчёта агрегатов документа, который вот-вот удалят. Без этого вызова
   * оценки на удалённый курс остаются сиротами — тот же класс проблемы, что уже решался для
   * уроков (Рефакторинг проблем/16), не был устранён для Rating при его введении.
   */
  async deleteAllRatingsForCourse(courseId: string): Promise<void> {
    if (!Types.ObjectId.isValid(courseId)) {
      return;
    }
    await RatingModel.deleteMany({ courseId: new Types.ObjectId(courseId) }).exec();
  }

  /**
   * Удаление пользователя — в отличие от deleteAllRatingsForCourse выше, соседние курсы
   * остаются существовать, поэтому их ratingSum/ratingCount/averageRating нужно честно
   * пересчитать, а не просто снести оценки молча (агрегат иначе тихо разойдётся с
   * реальностью — тот же denormalized-counter риск, что и у studentsCount, см. Obsidian:
   * "Денормализованные счётчики и soft-delete через status"). Один курс — своя транзакция:
   * пользователь редко оценивает больше нескольких курсов, накладные расходы незаметны,
   * а атомарность (удалить оценку + пересчитать агрегат) внутри одного курса обязательна.
   */
  async deleteAllRatingsForUser(userId: Types.ObjectId): Promise<void> {
    const ratings = await RatingModel.find({ userId }).exec();

    for (const rating of ratings) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await RatingModel.deleteOne({ _id: rating._id }, { session });

          await CourseModel.findByIdAndUpdate(
            rating.courseId,
            [
              {
                // $ifNull — тот же guard от курсов, созданных до появления ratingSum/
                // ratingCount в схеме, что и в addRating выше.
                $set: {
                  ratingSum: { $subtract: [{ $ifNull: ['$ratingSum', 0] }, rating.value] },
                  ratingCount: { $subtract: [{ $ifNull: ['$ratingCount', 0] }, 1] },
                },
              },
              {
                $set: {
                  averageRating: {
                    // $lte, не $eq — защита от отрицательного счётчика при любом уже
                    // накопленном рассогласовании, не только от ровно нулевого случая.
                    $cond: [
                      { $lte: ['$ratingCount', 0] },
                      0,
                      { $round: [{ $divide: ['$ratingSum', '$ratingCount'] }, 1] },
                    ],
                  },
                },
              },
            ],
            { session }
          ).exec();
        });
      } finally {
        await session.endSession();
      }
    }
  }
}

export const courseRepository = new CourseRepository();
