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
  ws.send(JSON.stringify(frame));
}

function closeWithError(ws: WebSocket, code: string, message: string): void {
  console.error(`[Gateway] Closing connection: ${code} — ${message}`);
  ws.close(1008, message);
}

function awaitOrSync<T>(value: Promise<T> | T): T {
  if (value instanceof Promise) {
    throw new Error('Async method handlers are not yet supported');
  }
  return value;
}

export function handleConnection(ws: WebSocket): void {
  const session = createSession();
  incrementConnections();
  let tickTimer: ReturnType<typeof setInterval> | undefined;

  console.log(`[Gateway] Client connected (${session.connId})`);
  send(ws, buildConnectChallenge());

  const cleanup = () => {
    if (tickTimer) clearInterval(tickTimer);
    decrementConnections();
    console.log(`[Gateway] Client disconnected (${session.connId})`);
  };

  ws.on('close', cleanup);
  ws.on('error', cleanup);

  ws.on('message', (rawData) => {
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

      const payload = awaitOrSync(handler(frame.params, session));
      send(ws, buildRes(frame.id, true, payload));

      if (frame.method === 'connect' && session.handshakeComplete && !tickTimer) {
        tickTimer = setInterval(() => {
          if (ws.readyState === ws.OPEN) {
            send(ws, buildTickEvent(nextEventSeq(session)));
          }
        }, TICK_INTERVAL_MS);
      }
    } catch (err) {
      const protocolErr =
        err instanceof ProtocolError ? err : ERR.INVALID_FRAME(String(err));
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
