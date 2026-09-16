import { loadConfig } from "./config.js";
import { startGateway } from "./gateway/server.js";
import {
  configureSessions,
  flushSessions,
  loadSessions,
} from "./gateway/sessions.js";

const config = loadConfig();
configureSessions(config.sessionsPath);

const loaded = await loadSessions();
console.log(`sessions loaded: ${loaded} from ${config.sessionsPath}`);

const wss = startGateway(config);

function shutdown(signal: string): void {
  console.log(`got ${signal}, closing...`);
  void flushSessions()
    .catch((err) => console.error("sessions flush failed:", err))
    .finally(() => {
      wss.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 3000).unref();
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
