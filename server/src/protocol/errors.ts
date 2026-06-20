import type { ResError } from './types.js';

export class ProtocolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ProtocolError';
  }

  toResError(): ResError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

export const ERR = {
  INVALID_FRAME: (msg: string) => new ProtocolError('INVALID_FRAME', msg),
  HANDSHAKE_REQUIRED: () =>
    new ProtocolError('HANDSHAKE_REQUIRED', 'First frame must be connect request'),
  UNKNOWN_METHOD: (method: string) =>
    new ProtocolError('UNKNOWN_METHOD', `Unknown method: ${method}`),
  PROTOCOL_MISMATCH: () =>
    new ProtocolError('PROTOCOL_MISMATCH', 'No compatible protocol version'),
  AUTH_FAILED: () => new ProtocolError('AUTH_FAILED', 'Invalid gateway token'),
} as const;
