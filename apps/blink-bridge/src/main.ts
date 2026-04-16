import { OutboundMessageWorker } from './outbound-message-worker';
import { InboundMessageWorker } from './inbound-message-worker';

async function main(): Promise<void> {
  const outbound = new OutboundMessageWorker();
  const inbound = new InboundMessageWorker();
  await outbound.start();
  await inbound.start();
}

void main();
