import 'dotenv/config';
import { WebSocketServer } from 'ws';
import { handleConnection } from './gateway/connection.js';

const PORT = Number(process.env.GATEWAY_PORT ?? 8080);

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', handleConnection);

console.log(`Mini-OpenClaw Gateway listening on ws://127.0.0.1:${PORT}`);

// --- Graceful Shutdown ---

function shutdown(signal: string): void {
  console.log(`\n[Gateway] Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  wss.close(() => {
    console.log('[Gateway] WebSocket server closed');
    process.exit(0);
  });

  // Force exit if connections take too long
  setTimeout(() => {
    console.error('[Gateway] Forced shutdown after timeout');
    process.exit(1);
  }, 5_000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
