import { WebSocketServer } from 'ws';
import { handleConnection } from './gateway/connection.js';

const PORT = Number(process.env.GATEWAY_PORT ?? 8080);

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', handleConnection);

console.log(`Mini-OpenClaw Gateway listening on ws://127.0.0.1:${PORT}`);
