var import_protocol_alias = require("@protocol-alias");
var import_config = require("./config");
var import_server = require("./server");
const config = (0, import_config.loadConfig)();
const server = (0, import_server.createSocketServer)(config);
const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
void server.start();
