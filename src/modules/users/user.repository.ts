import { NewUser, UpdateUser, UserDocument } from './user.types';
import { UserModel } from './user.model';
import { Types } from 'mongoose';

class UserRepository {
  async create(input: NewUser): Promise<UserDocument> {
    const user = new UserModel(input);
    return await user.save();
  }

  async findAll(): Promise<UserDocument[]> {
    return await UserModel.find().select('-password -emailVerificationToken -passwordResetToken').exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return await UserModel.findById(id).select('-password -emailVerificationToken -passwordResetToken').exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return await UserModel.findOne({ email: email.toLowerCase() })
      .select('-password -emailVerificationToken -passwordResetToken')
      .exec();
  }

  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return await UserModel.findOne({ email: email.toLowerCase() }).select('+password').exec();
  }

  async findByGoogleId(googleId: string): Promise<UserDocument | null> {
    return await UserModel.findOne({ googleId }).select('-password -emailVerificationToken -passwordResetToken').exec();
  }

  async findByGithubId(githubId: string): Promise<UserDocument | null> {
    return await UserModel.findOne({ githubId }).select('-password -emailVerificationToken -passwordResetToken').exec();
  }

  async findByOAuthProvider(provider: string, providerId: string): Promise<UserDocument | null> {
    if (provider === 'google') {
      return this.findByGoogleId(providerId);
    } else if (provider === 'github') {
      return this.findByGithubId(providerId);
    }
    return null;
  }

  async findByEmailVerificationToken(token: string): Promise<UserDocument | null> {
    return await UserModel.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() },
    }).exec();
  }

  async findByPasswordResetToken(token: string): Promise<UserDocument | null> {
    return await UserModel.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    }).exec();
  }

  async update(id: string, patch: UpdateUser): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error('Invalid user ID');
    }

    const updatedUser = await UserModel.findByIdAndUpdate(id, { ...patch }, { new: true, runValidators: true })
      .select('-password -emailVerificationToken -passwordResetToken')
      .exec();

    if (!updatedUser) {
      throw new Error('User not found');
    }

    return updatedUser;
  }

  async updateWithSensitiveFields(id: string, patch: UpdateUser): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error('Invalid user ID');
    }

    const updatedUser = await UserModel.findByIdAndUpdate(id, { ...patch }, { new: true, runValidators: true }).exec();

    if (!updatedUser) {
      throw new Error('User not found');
    }

    return updatedUser;
  }

  async isEmailTaken(email: string, excludeUserId?: string): Promise<boolean> {
    const query: {
      email: string;
      _id?: { $ne: Types.ObjectId };
    } = { email };

    if (excludeUserId) {
      query._id = { $ne: new Types.ObjectId(excludeUserId) };
    }

    const user = await UserModel.findOne(query).exec();
    return user !== null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      return false;
    }

    const result = await UserModel.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async verifyEmail(token: string): Promise<UserDocument | null> {
    const user = await this.findByEmailVerificationToken(token);

    if (!user) {
      return null;
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;

    return await user.save();
  }

  async resetPassword(token: string, newPassword: string): Promise<UserDocument | null> {
    const user = await this.findByPasswordResetToken(token);

    if (!user) {
      return null;
    }

    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;

    return await user.save();
  }
}

export const userRepository = new UserRepository();
