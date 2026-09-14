import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { Config } from "../config.js";
import { parseFrame } from "../protocol/parse.js";
import {
  PROTOCOL_VERSION,
  type ConnectParams,
  type EventFrame,
  type ReqFrame,
  type ResFrame,
} from "../protocol/types.js";
import {
  handleChatHistory,
  handleChatSend,
  handleHealth,
  handleSessionsCreate,
  handleSessionsDelete,
  handleSessionsGet,
  handleSessionsList,
  handleStatus,
} from "./methods.js";

const TICK_INTERVAL_MS = 15_000;

type ConnState = {
  id: string;
  authed: boolean;
  role: string | null;
  scopes: string[];
  challengeNonce: string;
};

export function handleConnection(socket: WebSocket, config: Config): void {
  const state: ConnState = {
    id: randomUUID(),
    authed: false,
    role: null,
    scopes: [],
    challengeNonce: randomUUID(),
  };

  const timers: { tick: ReturnType<typeof setInterval> | null } = { tick: null };

  sendEvent(socket, {
    type: "event",
    event: "connect.challenge",
    payload: {
      nonce: state.challengeNonce,
      ts: Date.now(),
    },
  });

  const handshakeTimer = setTimeout(() => {
    if (!state.authed) {
      socket.close(1008, "handshake timeout");
    }
  }, 15_000);

  socket.on("message", (data) => {
    const text = typeof data === "string" ? data : data.toString("utf8");
    const frame = parseFrame(text);
    if (!frame) {
      socket.close(1003, "invalid frame");
      return;
    }

    if (frame.type !== "req") {
      if (!state.authed) {
        socket.close(1008, "expected connect");
      }
      return;
    }

    void onRequest(socket, state, config, frame, handshakeTimer, timers);
  });

  socket.on("close", () => {
    clearTimeout(handshakeTimer);
    if (timers.tick) clearInterval(timers.tick);
  });
}

async function onRequest(
  socket: WebSocket,
  state: ConnState,
  config: Config,
  frame: ReqFrame,
  handshakeTimer: NodeJS.Timeout,
  timers: { tick: ReturnType<typeof setInterval> | null },
): Promise<void> {
  if (!state.authed) {
    if (frame.method !== "connect") {
      sendRes(socket, {
        type: "res",
        id: frame.id,
        ok: false,
        error: { code: "NOT_CONNECTED", message: "first method must be connect" },
      });
      socket.close(1008, "expected connect");
      return;
    }

    const result = tryConnect(state, config, frame.params);
    if (!result.ok) {
      sendRes(socket, {
        type: "res",
        id: frame.id,
        ok: false,
        error: result.error,
      });
      socket.close(1008, result.error.code);
      return;
    }

    clearTimeout(handshakeTimer);
    state.authed = true;
    state.role = result.role;
    state.scopes = result.scopes;

    sendRes(socket, {
      type: "res",
      id: frame.id,
      ok: true,
      payload: {
        type: "hello-ok",
        protocol: PROTOCOL_VERSION,
        server: {
          version: "0.1.0",
          connId: state.id,
        },
        features: {
          methods: [
            "health",
            "status",
            "sessions.create",
            "sessions.list",
            "sessions.get",
            "sessions.delete",
            "chat.send",
            "chat.history",
          ],
          events: ["tick"],
        },
        snapshot: {
          uptimeMs: Math.floor(process.uptime() * 1000),
        },
        auth: {
          role: result.role,
          scopes: result.scopes,
        },
        policy: {
          maxPayload: 1024 * 1024,
          tickIntervalMs: TICK_INTERVAL_MS,
        },
      },
    });

    // keepalive only after handshake; stop in socket "close"
    if (!timers.tick) {
      timers.tick = setInterval(() => {
        sendEvent(socket, {
          type: "event",
          event: "tick",
          payload: { ts: Date.now() },
        });
      }, TICK_INTERVAL_MS);
    }
    return;
  }

  if (frame.method === "health") {
    sendRes(socket, {
      type: "res",
      id: frame.id,
      ok: true,
      payload: handleHealth(),
    });
    return;
  }

  if (frame.method === "status") {
    sendRes(socket, {
      type: "res",
      id: frame.id,
      ok: true,
      payload: handleStatus({
        connId: state.id,
        role: state.role,
        scopes: state.scopes,
        protocol: PROTOCOL_VERSION,
      }),
    });
    return;
  }

  if (frame.method === "sessions.create") {
    sendRes(socket, {
      type: "res",
      id: frame.id,
      ok: true,
      payload: handleSessionsCreate(frame.params),
    });
    return;
  }

  if (frame.method === "sessions.list") {
    sendRes(socket, {
      type: "res",
      id: frame.id,
      ok: true,
      payload: handleSessionsList(),
    });
    return;
  }

  if (frame.method === "sessions.get") {
    const result = handleSessionsGet(frame.params);
    sendRes(socket, {
      type: "res",
      id: frame.id,
      ok: result.ok,
      ...(result.ok ? { payload: result.payload } : { error: result.error }),
    });
    return;
  }

  if (frame.method === "sessions.delete") {
    const result = handleSessionsDelete(frame.params);
    sendRes(socket, {
      type: "res",
      id: frame.id,
      ok: result.ok,
      ...(result.ok ? { payload: result.payload } : { error: result.error }),
    });
    return;
  }

  if (frame.method === "chat.send") {
    const result = handleChatSend(frame.params);
    sendRes(socket, {
      type: "res",
      id: frame.id,
      ok: result.ok,
      ...(result.ok ? { payload: result.payload } : { error: result.error }),
    });
    return;
  }

  if (frame.method === "chat.history") {
    const result = handleChatHistory(frame.params);
    sendRes(socket, {
      type: "res",
      id: frame.id,
      ok: result.ok,
      ...(result.ok ? { payload: result.payload } : { error: result.error }),
    });
    return;
  }

  sendRes(socket, {
    type: "res",
    id: frame.id,
    ok: false,
    error: { code: "METHOD_NOT_FOUND", message: `unknown method: ${frame.method}` },
  });
}

function tryConnect(
  state: ConnState,
  config: Config,
  params: unknown,
):
  | { ok: true; role: string; scopes: string[] }
  | { ok: false; error: { code: string; message: string } } {
  if (!params || typeof params !== "object") {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "connect params required" } };
  }

  const p = params as ConnectParams;

  if (
    typeof p.minProtocol !== "number" ||
    typeof p.maxProtocol !== "number" ||
    p.minProtocol > PROTOCOL_VERSION ||
    p.maxProtocol < PROTOCOL_VERSION
  ) {
    return {
      ok: false,
      error: {
        code: "PROTOCOL_MISMATCH",
        message: `server protocol ${PROTOCOL_VERSION}`,
      },
    };
  }

  if (!p.client?.id || !p.role) {
    return {
      ok: false,
      error: { code: "INVALID_REQUEST", message: "client and role required" },
    };
  }

  if (config.token) {
    const got = p.auth?.token;
    if (got !== config.token) {
      return { ok: false, error: { code: "UNAUTHORIZED", message: "bad token" } };
    }
  }

  // Day1: challenge nonce is issued but device signature is not verified yet.
  void state.challengeNonce;

  return {
    ok: true,
    role: p.role,
    scopes: p.scopes ?? ["operator.read"],
  };
}

function sendEvent(socket: WebSocket, frame: EventFrame): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(frame));
  }
}

function sendRes(socket: WebSocket, frame: ResFrame): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(frame));
  }
}
