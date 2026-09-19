import { config } from '../../../config';
import { handlePostboxEvent } from './postbox-events';
import { PostboxEventsConsumer } from './postbox-events.consumer';
import { createKinesisStreamClient, mongoCheckpointStore } from './postbox-events.kinesis';
import { suppressionService } from '../suppression/suppression.service';

let consumer: PostboxEventsConsumer | null = null;

// Запускается из server.ts (не из app.ts — тесты, бьющие в app через supertest, не должны ходить в
// облако). Без настроек потока (POSTBOX_EVENTS_*) ничего не делает — dev и тесты работают как раньше.
export function startPostboxEventsConsumer(): boolean {
  const { endpoint, streamName, keyId, secret, pollIntervalMs } = config.postbox.events;
  if (!endpoint || !streamName || !keyId || !secret) {
    return false;
  }

  consumer = new PostboxEventsConsumer({
    client: createKinesisStreamClient({ endpoint, streamName, region: config.postbox.region, keyId, secret }),
    checkpoints: mongoCheckpointStore,
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
