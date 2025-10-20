import {model, Schema} from 'mongoose'
import {ICourse} from "./course.types";

const courseSchema = new Schema<ICourse>({})

export const CourseModel = model('Course', courseSchema)