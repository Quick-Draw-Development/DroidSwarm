import '@protocol-alias';
import { loadConfig } from './config';
import { createSocketServer } from './server';

const config = loadConfig();
const server = createSocketServer(config);

const shutdown = async (): Promise<void> => {
  await server.stop();
  process.exit(0);
};

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});

void server.start();
