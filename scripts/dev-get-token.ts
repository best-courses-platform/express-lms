// Разовый dev-тулинг: печатает emailVerificationToken/passwordResetToken пользователя,
// читая их напрямую из Mongo (в обход HTTP API). Нужен потому, что verify-email/
// reset-password сознательно НЕ отдают токен в JSON-ответе ни в каком окружении — эндпоинт,
// возвращающий такой токен, легко превратить в account takeover одной забытой NODE_ENV
// (staging/qa/пустой NODE_ENV случайно попадают в "не production"). В реальном флоу токен
// приходит письмом — этот скрипт просто экономит поход в mongosh при ручном тестировании
// через http-requests/auth.http (см. verify-email/reset-password там).
//
// Как использовать:
//   npm run dev:token -- student@example.com
import mongoose from 'mongoose';
import { config } from '../src/config';
import { UserModel } from '../src/modules/users/user.model';

async function main(): Promise<void> {
  const email = process.argv[2];

  if (!email) {
    console.error('Использование: npm run dev:token -- <email>');
    process.exit(1);
  }

  await mongoose.connect(config.mongoUri);

  try {
    // Без repository — тот сознательно вырезает эти поля из обычных find* (см.
    // user.repository.ts, .select('-password -emailVerificationToken -passwordResetToken')),
    // а здесь как раз они и нужны.
    const user = await UserModel.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.error(`Пользователь с email ${email} не найден`);
      process.exitCode = 1;
      return;
    }

    console.log(`email: ${user.email}`);
    console.log(`isEmailVerified: ${user.isEmailVerified}`);
    console.log(`emailVerificationToken: ${user.emailVerificationToken ?? '(нет — уже подтверждён или не запрашивался)'}`);
    console.log(`passwordResetToken: ${user.passwordResetToken ?? '(нет — сброс не запрашивался)'}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error('Ошибка:', error);
  process.exit(1);
});
