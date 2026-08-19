import { Lesson, LessonResource, NewLesson, UpdateLesson, VideoFile } from './lesson.types';
import { LessonModel } from './lesson.model';
import { Types } from 'mongoose';

class LessonRepository {
  async create(input: NewLesson): Promise<Lesson> {
    const lesson = new LessonModel(input);
    return await lesson.save();
  }

  async findAll(): Promise<Lesson[]> {
    return await LessonModel.find().populate('courseId', 'title description author').sort({ createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<Lesson | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return await LessonModel.findById(id).populate('courseId', 'title description author').exec();
  }

  async findByTitleAndCourse(title: string, courseId: string): Promise<Lesson | null> {
    if (!Types.ObjectId.isValid(courseId)) {
      return null;
    }
    return await LessonModel.findOne({
      title,
      courseId: new Types.ObjectId(courseId),
    }).exec();
  }

  async findByCourseId(courseId: string): Promise<Lesson[]> {
    if (!Types.ObjectId.isValid(courseId)) {
      return [];
    }
    return await LessonModel.find({ courseId: new Types.ObjectId(courseId) })
      .populate('courseId', 'title description author')
      .sort({ order: 1 })
      .exec();
  }

  async findByCourseIdWithPagination(
    courseId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ lessons: Lesson[]; total: number }> {
    if (!Types.ObjectId.isValid(courseId)) {
      return { lessons: [], total: 0 };
    }

    const skip = (page - 1) * limit;
    const [lessons, total] = await Promise.all([
      LessonModel.find({ courseId: new Types.ObjectId(courseId) })
        .populate('courseId', 'title description author')
        .sort({ order: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      LessonModel.countDocuments({ courseId: new Types.ObjectId(courseId) }),
    ]);

    return { lessons, total };
  }

  async update(id: string, patch: UpdateLesson): Promise<Lesson> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error('Invalid lesson ID');
    }

    const updatedLesson = await LessonModel.findByIdAndUpdate(id, { ...patch }, { new: true, runValidators: true })
      .populate('courseId', 'title description author')
      .exec();

    if (!updatedLesson) {
      throw new Error('Lesson not found');
    }

    return updatedLesson;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      return false;
    }

    const result = await LessonModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  async getNextOrderNumber(courseId: string): Promise<number> {
    if (!Types.ObjectId.isValid(courseId)) {
      return 1;
    }

    const lastLesson = await LessonModel.findOne({ courseId: new Types.ObjectId(courseId) })
      .sort({ order: -1 })
      .select('order')
      .exec();

    return lastLesson ? lastLesson.order + 1 : 1;
  }

  async reorderLessons(courseId: string, newOrder: { lessonId: string; order: number }[]): Promise<void> {
    if (!Types.ObjectId.isValid(courseId)) {
      return;
    }

    const bulkOps = newOrder.map(({ lessonId, order }) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(lessonId), courseId: new Types.ObjectId(courseId) },
        update: { $set: { order } },
      },
    }));

    await LessonModel.bulkWrite(bulkOps);
  }

  // Метод для обновления только видео файла
  async updateVideoFile(lessonId: string, videoFile: VideoFile | undefined): Promise<Lesson> {
    if (!Types.ObjectId.isValid(lessonId)) {
      throw new Error('Invalid lesson ID');
    }

    // { videoFile: undefined } молча теряет ключ при сборке update-объекта в Mongoose —
    // MongoDB его просто не видит, поле не удаляется, хотя ответ выглядит успешным.
    // $unset — единственный способ реально убрать поле при videoFile === undefined.
    const update = videoFile ? { $set: { videoFile } } : { $unset: { videoFile: 1 } };

    const updatedLesson = await LessonModel.findByIdAndUpdate(lessonId, update, {
      new: true,
      runValidators: true,
    })
      .populate('courseId', 'title description author')
      .exec();

    if (!updatedLesson) {
      throw new Error('Lesson not found');
    }

    return updatedLesson;
  }

  // Метод для добавления ресурса
  async addResource(lessonId: string, resource: LessonResource): Promise<Lesson> {
    if (!Types.ObjectId.isValid(lessonId)) {
      throw new Error('Invalid lesson ID');
    }

    const updatedLesson = await LessonModel.findByIdAndUpdate(
      lessonId,
      { $push: { resources: resource } },
      { new: true, runValidators: true }
    )
      .populate('courseId', 'title description author')
      .exec();

    if (!updatedLesson) {
      throw new Error('Lesson not found');
    }

    return updatedLesson;
  }

  // Метод для удаления ресурса по индексу
  async removeResourceByIndex(lessonId: string, resourceIndex: number): Promise<Lesson> {
    if (!Types.ObjectId.isValid(lessonId)) {
      throw new Error('Invalid lesson ID');
    }

    // Два шага неизбежны: $unset зануляет элемент по индексу, не сдвигая остальные (в отличие
    // от $pull, у которого нет способа адресовать элемент по позиции), а $pull потом убирает
    // образовавшийся null. Раньше клиенту возвращали результат ПЕРВОГО шага (ещё с null внутри) —
    // здесь возвращаем результат второго, уже очищенного запроса.
    const updateQuery: Record<string, 1> = {};
    updateQuery[`resources.${resourceIndex}`] = 1;

    await LessonModel.findByIdAndUpdate(lessonId, { $unset: updateQuery }, { runValidators: true }).exec();

    const updatedLesson = await LessonModel.findByIdAndUpdate(lessonId, { $pull: { resources: null } }, { new: true })
      .populate('courseId', 'title description author')
      .exec();

    if (!updatedLesson) {
      throw new Error('Lesson not found');
    }

    return updatedLesson;
  }
}

export const lessonRepository = new LessonRepository();
