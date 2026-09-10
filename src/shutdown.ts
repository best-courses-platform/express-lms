import { Server } from 'http';
import mongoose from 'mongoose';
import { closePasswordHasherPool } from './modules/users/password-hasher';
import { closeEmailWorker } from './modules/email/email.worker';
import { emailQueue } from './modules/email/email.queue';

// Меньше стандартного k8s terminationGracePeriodSeconds (30с по умолчанию) — если сами не
// уложились, лучше выйти по своему таймауту с кодом 1, чем дождаться, пока kubelet пришлёт
// SIGKILL: наш путь хотя бы логирует причину, SIGKILL — нет.
const SHUTDOWN_TIMEOUT_MS = 10_000;

let shuttingDown = false;

// Читается /readyz (см. app.ts) — как только начали останавливаться, отвечаем 503
// ДО того, как реально перестанем обрабатывать запросы, чтобы k8s успел вывести под
// из балансировки за счёт readiness-пробы, не дожидаясь обрыва соединений.
export function isShuttingDown(): boolean {
  return shuttingDown;
}

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}

// Promise.allSettled, не Promise.all — падение одной зависимости (например, Redis уже
// недоступен) не должно останавливать закрытие остальных; ошибки логируются ниже.
async function closeDependencies(): Promise<void> {
  const results = await Promise.allSettled([
    closeEmailWorker(),
    emailQueue?.close() ?? Promise.resolve(),
    closePasswordHasherPool(),
    mongoose.connection.close(false),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Ошибка при закрытии зависимости во время shutdown:', result.reason);
    }
  }
}

async function shutdown(reason: string, server: Server): Promise<void> {
  // Повторный сигнал/повторная необработанная ошибка во время уже идущей остановки —
  // не начинаем всё заново, просто игнорируем (иначе второй SIGTERM от нетерпеливого
  // оператора сбросил бы уже идущий, аккуратный дренаж).
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[shutdown] Получен ${reason} — начинаю graceful shutdown`);

  // Простаивающие keep-alive соединения не in-flight — ждать их до общего таймаута
  // незачем, разрываем сразу. Node 18.2+.
  server.closeIdleConnections();

  const forceExitTimer = setTimeout(() => {
    console.error(`[shutdown] Не уложились в ${SHUTDOWN_TIMEOUT_MS}мс — принудительный выход`);
    server.closeAllConnections();
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref(); // не должен сам по себе держать процесс живым, если всё закрылось раньше

  try {
    // Сначала HTTP: новые запросы не принимаются, ждём завершения уже идущих. Только
    // после этого закрываем БД/очередь/пул — иначе можно оборвать операцию, которую
    // ещё обрабатывает живой запрос.
    await closeHttpServer(server);
    await closeDependencies();
    clearTimeout(forceExitTimer);
    console.log('[shutdown] Завершено штатно');
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimer);
    console.error('[shutdown] Ошибка во время остановки:', error);
    process.exit(1);
  }
}

export function registerGracefulShutdown(server: Server): void {
  const trigger = (reason: string) => {
    shutdown(reason, server).catch(error => {
      // shutdown() сама не должна бросать (все ветки заканчиваются process.exit) —
      // это перестраховка на случай синхронной ошибки до первого await.
      console.error('[shutdown] Необработанная ошибка внутри shutdown():', error);
      process.exit(1);
    });
  };

  process.on('SIGTERM', () => trigger('SIGTERM'));
  process.on('SIGINT', () => trigger('SIGINT'));

  // Состояние процесса после uncaughtException считается неопределённым (Node сам это
  // декларирует) — не пытаемся продолжить работу, только логируем стек и идём по тому же
  // пути остановки, что и по сигналу, чтобы закрыть соединения аккуратно, а не просто упасть.
  process.on('uncaughtException', error => {
    console.error('[shutdown] uncaughtException:', error);
    trigger('uncaughtException');
  });

  process.on('unhandledRejection', reason => {
    console.error('[shutdown] unhandledRejection:', reason);
    trigger('unhandledRejection');
  });
}
