import { config } from '../../../config';
import { handlePostboxEvent } from './postbox-events';
import { PostboxEventsConsumer } from './postbox-events.consumer';
import {
  createKinesisStreamClient,
  mongoCheckpointStore,
  mongoDeadLetterStore,
  mongoIsHealthy,
} from './postbox-events.kinesis';
import { suppressionService } from '../suppression/suppression.service';

let consumer: PostboxEventsConsumer | null = null;

// Запускается из server.ts (не из app.ts — тесты, бьющие в app через supertest, не должны ходить в
// облако). Не запускается, если выключен POSTBOX_EVENTS_ENABLED=false (API-поды в k8s) или не заданы
// настройки потока (POSTBOX_EVENTS_*) — dev и тесты работают как раньше.
export function startPostboxEventsConsumer(): boolean {
  const { enabled, endpoint, streamName, keyId, secret, pollIntervalMs } = config.postbox.events;
  if (consumer || !enabled || !endpoint || !streamName || !keyId || !secret) {
    return false;
  }

  consumer = new PostboxEventsConsumer({
    client: createKinesisStreamClient({ endpoint, streamName, region: config.postbox.region, keyId, secret }),
    checkpoints: mongoCheckpointStore,
    deadLetters: mongoDeadLetterStore,
    isDependencyHealthy: mongoIsHealthy,
    onEvent: async event => {
      await handlePostboxEvent(event, suppressionService);
    },
    pollIntervalMs,
  });
  consumer.start();
  console.log(`Postbox events: читаю поток ${streamName}`);
  return true;
}

// Безопасно вызывать и когда потребитель не запускался — для graceful shutdown.
export async function stopPostboxEventsConsumer(): Promise<void> {
  await consumer?.stop();
  consumer = null;
}
