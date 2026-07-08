import type { RawData, WebSocket } from 'ws';
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
  handleWhoami,
} from './protocol-handler.js';
import { createSession, nextEventSeq } from './session.js';
import { getMethodHandler, registerMethod } from './router.js';
import { incrementConnections, decrementConnections } from './state.js';

registerMethod('connect', handleConnect);
registerMethod('health', () => handleHealth());
registerMethod('status', (_params, session) => handleStatus(session));
registerMethod('whoami', handleWhoami);

const TICK_INTERVAL_MS = 15_000;

function send(ws: WebSocket, frame: ResFrame | EventFrame): void {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(frame));
    } catch (err) {
      console.error('[Gateway] Failed to send ws message:', err);
    }
  }
}

function closeWithError(ws: WebSocket, code: string, message: string): void {
  console.error(`[Gateway] Closing connection: ${code} — ${message}`);
  if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
    try {
      ws.close(1008, message);
    } catch (err) {
      console.error('[Gateway] Failed to close ws connection safely:', err);
    }
  }
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

  ws.on('message', async (rawData: RawData) => {
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

      // Execute the method handler
      const payload = await Promise.resolve(handler(frame.params, session));
      
      // Guard against connection release during async handler execution
      if (isCleanedUp) return;

      send(ws, buildRes(frame.id, true, payload));

      if (frame.method === 'connect' && session.handshakeComplete) {
        if (tickTimer) clearInterval(tickTimer);
        
        tickTimer = setInterval(() => {
          if (ws.readyState === ws.OPEN) {
            send(ws, buildTickEvent(nextEventSeq(session)));
          }
        }, TICK_INTERVAL_MS);
      }
    } catch (err) {
      console.error(`[Gateway] Error processing message from ${session.connId}:`, err);
      
      const protocolErr =
        err instanceof ProtocolError 
          ? err 
          : ERR.INVALID_FRAME(err instanceof Error ? err.message : String(err));
          
      if (!isCleanedUp) {
        send(ws, buildRes(reqId, false, protocolErr));
      }

      const shouldClose = 
        !session.handshakeComplete ||
        protocolErr.code === 'HANDSHAKE_REQUIRED' ||
        protocolErr.code === 'INVALID_JSON';

      if (shouldClose) {
        closeWithError(ws, protocolErr.code, protocolErr.message);
        cleanup(); // Ensure local cleanup is triggered
      }
    }
  });
}
