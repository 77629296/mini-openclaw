import { Ajv, type ValidateFunction } from 'ajv';
import type { ConnectParams, ReqFrame } from './types.js';
import { ProtocolError } from './errors.js';

const ajv = new Ajv({ allErrors: true, strict: false });

const reqFrameSchema = {
  type: 'object',
  required: ['type', 'id', 'method'],
  additionalProperties: false,
  properties: {
    type: { const: 'req' },
    id: { type: 'string', minLength: 1 },
    method: { type: 'string', minLength: 1 },
    params: {},
  },
} as const;

const connectParamsSchema = {
  type: 'object',
  required: ['minProtocol', 'maxProtocol', 'client', 'role'],
  additionalProperties: true,
  properties: {
    minProtocol: { type: 'integer', minimum: 1 },
    maxProtocol: { type: 'integer', minimum: 1 },
    client: {
      type: 'object',
      required: ['id', 'version', 'platform', 'mode'],
      additionalProperties: true,
      properties: {
        id: { type: 'string', minLength: 1 },
        version: { type: 'string', minLength: 1 },
        platform: { type: 'string', minLength: 1 },
        mode: { type: 'string', minLength: 1 },
      },
    },
    role: { enum: ['operator', 'node'] },
    scopes: { type: 'array', items: { type: 'string' } },
    auth: {
      type: 'object',
      additionalProperties: true,
      properties: { token: { type: 'string' } },
    },
    locale: { type: 'string' },
    userAgent: { type: 'string' },
  },
} as const;

const validateReqFrame: ValidateFunction<ReqFrame> = ajv.compile(reqFrameSchema);
const validateConnectParams: ValidateFunction<ConnectParams> =
  ajv.compile(connectParamsSchema);

function formatAjvErrors(fn: ValidateFunction): string {
  return (fn.errors ?? [])
    .map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`)
    .join('; ');
}

export function parseJsonFrame(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ProtocolError('INVALID_JSON', 'Frame is not valid JSON');
  }
}

export function assertReqFrame(data: unknown): ReqFrame {
  if (!validateReqFrame(data)) {
    throw new ProtocolError(
      'INVALID_FRAME',
      `Invalid req frame: ${formatAjvErrors(validateReqFrame)}`,
    );
  }
  return data;
}

export function assertConnectParams(data: unknown): ConnectParams {
  if (!validateConnectParams(data)) {
    throw new ProtocolError(
      'INVALID_CONNECT',
      `Invalid connect params: ${formatAjvErrors(validateConnectParams)}`,
    );
  }
  return data;
}
