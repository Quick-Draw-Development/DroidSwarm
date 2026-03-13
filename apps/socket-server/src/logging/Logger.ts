import pino from 'pino';

import type { ServerConfig } from '../types';

export const createLogger = (config: ServerConfig) =>
  pino({
    level: config.environment === 'development' ? 'debug' : 'info',
  });
