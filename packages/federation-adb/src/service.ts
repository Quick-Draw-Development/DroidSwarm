import { createServer } from 'node:http';

import { listAdbDevices } from './index';

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const startAdbSupervisor = () => {
  const host = process.env.DROIDSWARM_FEDERATION_ADB_HOST ?? '127.0.0.1';
  const port = toPositiveInt(process.env.DROIDSWARM_FEDERATION_ADB_PORT, 4961);
  const adbBin = process.env.DROIDSWARM_FEDERATION_ADB_BIN ?? 'adb';

  const server = createServer(async (_request, response) => {
    try {
      const devices = await listAdbDevices(adbBin);
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({
        updatedAt: new Date().toISOString(),
        adbBin,
        deviceCount: devices.length,
        devices,
      }));
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        adbBin,
      }));
    }
  });

  server.listen(port, host);
  return server;
};

if (require.main === module) {
  startAdbSupervisor();
}
