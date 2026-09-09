import { loadConfig } from "./config.js";
import { startGateway } from "./gateway/server.js";

const config = loadConfig();
const wss = startGateway(config);

function shutdown(signal: string): void {
  console.log(`got ${signal}, closing...`);
  wss.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
