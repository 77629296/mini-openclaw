import { randomUUID } from 'node:crypto';
import {
  GATEWAY_EVENTS,
  GATEWAY_METHODS,
  PROTOCOL_VERSION,
  type ConnectParams,
  type EventFrame,
  type HealthPayload,
  type HelloOkPayload,
  type ResFrame,
  type StatusPayload,
} from '../protocol/types.js';
import { ERR, ProtocolError } from '../protocol/errors.js';
import { assertConnectParams } from '../protocol/schema.js';
import type { GatewaySession } from './session.js';
import { applyConnect } from './session.js';
import { getConnectionCount, getUptime } from './state.js';

const SERVER_VERSION = '0.1.0';
const TICK_INTERVAL_MS = 15_000;
const MAX_PAYLOAD = 65_536;
const MAX_BUFFERED_BYTES = 131_072;

export function buildHealthPayload(): HealthPayload {
  return {
    ok: true,
    status: 'healthy',
    uptime: getUptime(),
    version: SERVER_VERSION,
    ts: Date.now(),
  };
}

export function handleConnect(
  params: unknown,
  session: GatewaySession,
): HelloOkPayload {
  const connectParams = assertConnectParams(params) as ConnectParams;

  if (
    connectParams.minProtocol > PROTOCOL_VERSION ||
    connectParams.maxProtocol < PROTOCOL_VERSION
  ) {
    throw ERR.PROTOCOL_MISMATCH();
  }

  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (token && connectParams.auth?.token !== token) {
    throw ERR.AUTH_FAILED();
  }

  applyConnect(session, connectParams);

  return {
    type: 'hello-ok',
    protocol: PROTOCOL_VERSION,
    server: { version: SERVER_VERSION, connId: session.connId },
    features: {
      methods: [...GATEWAY_METHODS],
      events: [...GATEWAY_EVENTS],
    },
    snapshot: { health: buildHealthPayload() },
    auth: { role: session.role, scopes: session.scopes },
    policy: {
      maxPayload: MAX_PAYLOAD,
      maxBufferedBytes: MAX_BUFFERED_BYTES,
      tickIntervalMs: TICK_INTERVAL_MS,
    },
  };
}

export function handleHealth(): HealthPayload {
  return buildHealthPayload();
}

export function handleStatus(session: GatewaySession): StatusPayload {
  return {
    gateway: {
      version: SERVER_VERSION,
      uptime: getUptime(),
      connId: session.connId,
    },
    connections: getConnectionCount(),
    protocol: PROTOCOL_VERSION,
    role: session.role,
    scopes: session.scopes,
  };
}

export function buildConnectChallenge(): EventFrame {
  return {
    type: 'event',
    event: 'connect.challenge',
    payload: { nonce: randomUUID(), ts: Date.now() },
  };
}

export function buildTickEvent(seq: number): EventFrame {
  return {
    type: 'event',
    event: 'tick',
    payload: { ts: Date.now() },
    seq,
  };
}

export function buildRes(id: string, ok: true, payload: unknown): ResFrame;
export function buildRes(id: string, ok: false, error: ProtocolError): ResFrame;
export function buildRes(
  id: string,
  ok: boolean,
  payloadOrError: unknown,
): ResFrame {
  if (ok) {
    return { type: 'res', id, ok: true, payload: payloadOrError };
  }
  const err =
    payloadOrError instanceof ProtocolError
      ? payloadOrError
      : ERR.INVALID_FRAME(String(payloadOrError));
  return { type: 'res', id, ok: false, error: err.toResError() };
}
