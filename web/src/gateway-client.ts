type Role = "operator" | "node";

export type ReqFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

export type ResFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
};

export type EventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
};

export type Frame = ReqFrame | ResFrame | EventFrame;

type Pending = {
  resolve: (frame: ResFrame) => void;
  reject: (err: Error) => void;
};

export type GatewayClientOptions = {
  url: string;
  token?: string;
  clientId?: string;
};

const MAX_RECONNECT_MS = 10_000;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private seq = 0;
  private challengeNonce: string | null = null;
  private stopped = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  onHello: ((payload: unknown) => void) | null = null;
  onStatus: ((status: string) => void) | null = null;
  onEvent: ((event: string, payload: unknown) => void) | null = null;

  constructor(private opts: GatewayClientOptions) {}

  connect(): void {
    this.stopped = false;
    this.openSocket();
  }

  close(): void {
    this.stopped = true;
    this.clearReconnect();
    this.dropSocket();
    this.failAll(new Error("closed"));
  }

  request(method: string, params?: unknown): Promise<ResFrame> {
    const id = `req-${++this.seq}`;
    const frame: ReqFrame = { type: "req", id, method, params };

    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("not connected"));
        return;
      }
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(frame));
    });
  }

  private openSocket(): void {
    this.clearReconnect();
    this.dropSocket();
    this.onStatus?.("connecting");

    const ws = new WebSocket(this.opts.url);
    this.ws = ws;

    ws.onopen = () => {
      this.onStatus?.("open");
    };

    ws.onmessage = (ev) => {
      const frame = JSON.parse(String(ev.data)) as Frame;
      this.handleFrame(frame);
    };

    ws.onerror = () => {
      this.onStatus?.("error");
    };

    ws.onclose = () => {
      this.ws = null;
      this.failAll(new Error("socket closed"));
      if (this.stopped) {
        this.onStatus?.("closed");
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * 2 ** this.attempt, MAX_RECONNECT_MS);
    this.attempt += 1;
    this.onStatus?.(`reconnect in ${Math.ceil(delay / 1000)}s`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private dropSocket(): void {
    if (!this.ws) return;
    const ws = this.ws;
    this.ws = null;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    ws.close();
  }

  private handleFrame(frame: Frame): void {
    if (frame.type === "event") {
      if (frame.event === "connect.challenge") {
        const payload = frame.payload as { nonce?: string } | undefined;
        this.challengeNonce = payload?.nonce ?? null;
        void this.sendConnect();
        return;
      }
      this.onEvent?.(frame.event, frame.payload);
      return;
    }

    if (frame.type === "res") {
      const wait = this.pending.get(frame.id);
      if (wait) {
        this.pending.delete(frame.id);
        wait.resolve(frame);
      }
    }
  }

  private async sendConnect(): Promise<void> {
    const res = await this.request("connect", {
      minProtocol: 1,
      maxProtocol: 1,
      client: {
        id: this.opts.clientId ?? "web",
        version: "0.1.0",
        platform: navigator.platform || "web",
        mode: "operator",
      },
      role: "operator" satisfies Role,
      scopes: ["operator.read"],
      auth: this.opts.token ? { token: this.opts.token } : undefined,
      // challenge nonce only; signature comes later
      device: this.challengeNonce
        ? { nonce: this.challengeNonce, signedAt: Date.now() }
        : undefined,
    });

    if (!res.ok) {
      this.onStatus?.(`connect failed: ${res.error?.message ?? "unknown"}`);
      this.ws?.close();
      return;
    }

    this.attempt = 0;
    this.onHello?.(res.payload);
    this.onStatus?.("ready");
  }

  private failAll(err: Error): void {
    for (const wait of this.pending.values()) {
      wait.reject(err);
    }
    this.pending.clear();
  }
}
