// Разовый dev-тулинг: выдаёт пользователю НОВЫЙ токен подтверждения email или сброса пароля и
// печатает его, записывая в Mongo только sha256 (как это делает сервис). Нужен потому, что
// verify-email/reset-password сознательно НЕ отдают токен в JSON-ответе ни в каком окружении —
// эндпоинт, возвращающий такой токен, легко превратить в account takeover одной забытой NODE_ENV
// (staging/qa/пустой NODE_ENV случайно попадают в "не production"). В реальном флоу токен
// приходит письмом — этот скрипт экономит поход в mongosh при ручном тестировании через
// http-requests/auth.http (см. verify-email/reset-password там).
//
// Раньше скрипт читал токен из БД как есть. С 2026-09-19 в БД лежит только хеш токена — прочитать
// из неё рабочий токен уже нельзя (в этом и смысл), поэтому скрипт выдаёт свежий. Предыдущий токен
// этого типа при выдаче нового перестаёт работать.
//
// Как использовать:
//   npm run dev:token -- student@example.com            # статус (без токенов)
//   npm run dev:token -- student@example.com verify     # выдать токен подтверждения email
//   npm run dev:token -- student@example.com reset      # выдать токен сброса пароля
import mongoose from 'mongoose';
import { config } from '../src/config';
import { UserModel } from '../src/modules/users/user.model';
import { EMAIL_VERIFICATION_TTL_MS, PASSWORD_RESET_TTL_MS } from '../src/modules/users/user.constants';
import { generateOneTimeToken } from '../src/utils/one-time-token';

async function main(): Promise<void> {
  const email = process.argv[2];
  const kind = process.argv[3];

  if (!email || (kind !== undefined && kind !== 'verify' && kind !== 'reset')) {
    console.error('Использование: npm run dev:token -- <email> [verify|reset]');
    process.exit(1);
  }

  await mongoose.connect(config.mongoUri);

  try {
    // Без repository — обычные find* репозитория вырезают поля токенов из выборки.
    const user = await UserModel.findOne({ email: email.toLowerCase() }).select(
      '+emailVerificationToken +passwordResetToken'
    );

    if (!user) {
      console.error(`Пользователь с email ${email} не найден`);
      process.exitCode = 1;
      return;
    }

    console.log(`email: ${user.email}`);
    console.log(`isEmailVerified: ${user.isEmailVerified}`);

    if (kind === 'verify') {
      const { token, tokenHash } = generateOneTimeToken();
      await UserModel.updateOne(
        { _id: user._id },
        {
          emailVerificationToken: tokenHash,
          emailVerificationExpires: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
        }
      );
      console.log(`emailVerificationToken (выдан новый, действует 24 ч): ${token}`);
    } else if (kind === 'reset') {
      const { token, tokenHash } = generateOneTimeToken();
      await UserModel.updateOne(
        { _id: user._id },
        { passwordResetToken: tokenHash, passwordResetExpires: new Date(Date.now() + PASSWORD_RESET_TTL_MS) }
      );
      console.log(`passwordResetToken (выдан новый, действует 1 ч): ${token}`);
    } else {
      console.log(`токен подтверждения email в БД: ${user.emailVerificationToken ? 'есть (хеш)' : 'нет'}`);
      console.log(`токен сброса пароля в БД: ${user.passwordResetToken ? 'есть (хеш)' : 'нет'}`);
      console.log('Чтобы получить рабочий токен, добавьте verify или reset вторым аргументом.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error('Ошибка:', error);
  process.exit(1);
});
