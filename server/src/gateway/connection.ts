import type { WebSocket } from 'ws';
import { parseJsonFrame, assertReqFrame } from '../protocol/schema.js';
import { ERR, ProtocolError } from '../protocol/errors.js';
import type { EventFrame, ResFrame } from '../protocol/types.js';
import {
  buildConnectChallenge,
  buildRes,
  buildTickEvent,
  handleConnect,
  handleHealth,
  handleStatus,
} from './protocol-handler.js';
import { createSession, nextEventSeq } from './session.js';
import { getMethodHandler, registerMethod } from './router.js';
import { incrementConnections, decrementConnections } from './state.js';

registerMethod('connect', handleConnect);
registerMethod('health', () => handleHealth());
registerMethod('status', (_params, session) => handleStatus(session));

const TICK_INTERVAL_MS = 15_000;

function send(ws: WebSocket, frame: ResFrame | EventFrame): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(frame));
  }
}

function closeWithError(ws: WebSocket, code: string, message: string): void {
  console.error(`[Gateway] Closing connection: ${code} — ${message}`);
  ws.close(1008, message);
}

export function handleConnection(ws: WebSocket): void {
  const session = createSession();
  incrementConnections();
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let isCleanedUp = false;

  console.log(`[Gateway] Client connected (${session.connId})`);
  send(ws, buildConnectChallenge());

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;

    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = undefined;
    }
    decrementConnections();
    console.log(`[Gateway] Client disconnected (${session.connId})`);
  };

  ws.on('close', cleanup);
  ws.on('error', (err) => {
    console.error(`[Gateway] Connection error on ${session.connId}:`, err);
    cleanup();
  });

  ws.on('message', async (rawData) => {
    let reqId = 'unknown';

    try {
      const parsed = parseJsonFrame(rawData.toString());
      const frame = assertReqFrame(parsed);
      reqId = frame.id;

      if (!session.handshakeComplete && frame.method !== 'connect') {
        throw ERR.HANDSHAKE_REQUIRED();
      }

      const handler = getMethodHandler(frame.method);
      if (!handler) {
        throw ERR.UNKNOWN_METHOD(frame.method);
      }

      // 通过 Promise.resolve 兼容同步与异步 handler，移除临时同步断言
      const payload = await Promise.resolve(handler(frame.params, session));
      send(ws, buildRes(frame.id, true, payload));

      if (frame.method === 'connect' && session.handshakeComplete) {
        // 防御恶意或重复的 connect 请求导致定时器泄露
        if (tickTimer) clearInterval(tickTimer);
        
        tickTimer = setInterval(() => {
          send(ws, buildTickEvent(nextEventSeq(session)));
        }, TICK_INTERVAL_MS);
      }
    } catch (err) {
      console.error(`[Gateway] Error processing message from ${session.connId}:`, err);
      
      const protocolErr =
        err instanceof ProtocolError 
          ? err 
          : ERR.INVALID_FRAME(err instanceof Error ? err.message : String(err));
          
      send(ws, buildRes(reqId, false, protocolErr));

      if (
        !session.handshakeComplete ||
        protocolErr.code === 'HANDSHAKE_REQUIRED' ||
        protocolErr.code === 'INVALID_JSON'
      ) {
        closeWithError(ws, protocolErr.code, protocolErr.message);
      }
    }
  });
}
