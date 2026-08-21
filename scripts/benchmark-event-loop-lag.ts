// Разовый (не production) бенчмарк: сравнить event loop lag под нагрузкой на
// POST /api/auth/login с офлоадом bcrypt в worker_threads и без него.
//
// Как использовать:
//   1. На ветке main (bcrypt.compare в главном потоке): NODE_ENV=test npx tsx scripts/benchmark-event-loop-lag.ts
//   2. На ветке 18_worker-threads-highload (офлоад через piscina): та же команда
//   3. Сравнить вывод обоих прогонов.
//
// Поднимает копию app в отдельном процессе поверх реальной MongoDB (тот же MONGO_URI
// из .env), создаёт одного тестового пользователя напрямую через UserModel (минуя
// register/email — тестируем именно comparePassword, не email-флоу), гоняет нагрузку
// через autocannon, сэмплирует event loop lag через perf_hooks.monitorEventLoopDelay()
// весь период прогона, в конце всё печатает и подчищает за собой тестового пользователя.
import { monitorEventLoopDelay } from 'perf_hooks';
import mongoose from 'mongoose';
import autocannon from 'autocannon';
import app from '../src/app';
import { config } from '../src/config';
import { UserModel } from '../src/modules/users/user.model';

const TEST_EMAIL = 'event-loop-lag-benchmark@example.com';
const TEST_PASSWORD = 'benchmark-password-123';

const toMs = (nanoseconds: number) => Math.round((nanoseconds / 1e6) * 100) / 100;

async function main() {
  await mongoose.connect(config.mongoUri);

  await UserModel.deleteOne({ email: TEST_EMAIL });
  // pre('save') хук хеширует пароль тем же путём, что и реальная регистрация —
  // на этой ветке через worker_threads, на main напрямую через bcryptjs.
  await UserModel.create({
    name: 'Benchmark User',
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    isEmailVerified: true,
  });

  const server = app.listen(0);
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Не удалось получить порт тестового сервера');
  }
  const { port } = address;

  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();

  console.log(`Бенчмарк: POST /api/auth/login, порт ${port}, 50 соединений, 15 секунд...`);

  const result = await autocannon({
    url: `http://localhost:${port}/api/auth/login`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    connections: 50,
    duration: 15,
  });

  histogram.disable();

  console.log('\n=== Event loop lag (мс) ===');
  console.log('min:   ', toMs(histogram.min));
  console.log('mean:  ', toMs(histogram.mean));
  console.log('p50:   ', toMs(histogram.percentile(50)));
  console.log('p99:   ', toMs(histogram.percentile(99)));
  console.log('max:   ', toMs(histogram.max));

  console.log('\n=== Autocannon (латентность запроса, мс) ===');
  console.log('mean:  ', result.latency.mean);
  console.log('p50:   ', result.latency.p50);
  console.log('p99:   ', result.latency.p99);
  console.log('max:   ', result.latency.max);
  console.log('req/sec:', result.requests.average);
  console.log('non-2xx:', result.non2xx);

  await UserModel.deleteOne({ email: TEST_EMAIL });
  await mongoose.connection.close();
  server.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
