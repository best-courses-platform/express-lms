import {model, Schema} from 'mongoose'
import {IUser} from "./user.types";

const userSchema = new Schema<IUser>({})

export const UserModel = model('User', userSchema)