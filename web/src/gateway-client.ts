/** Lightweight Gateway WS client — mirrors server protocol v1 */

export interface ReqFrame {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

export interface ResFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
}

export interface EventFrame {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
}

export interface HelloOkPayload {
  type: 'hello-ok';
  protocol: number;
  server: { version: string; connId: string };
  features: { methods: string[]; events: string[] };
  snapshot: { health: { ok: boolean; status: string; uptime: number } };
  auth: { role: string; scopes: string[] };
  policy: { tickIntervalMs: number };
}

/** A captured event entry for the UI event log */
export interface LoggedEvent {
  id: number;
  ts: number;
  event: string;
  payload: unknown;
}

type PendingRequest = {
  resolve: (frame: ResFrame) => void;
  reject: (err: Error) => void;
};

function randomId(): string {
  return globalThis.crypto.randomUUID();
}

export class GatewayClient {
  #ws: WebSocket | null = null;
  #pending = new Map<string, PendingRequest>();
  #connected = false;
  #hello: HelloOkPayload | null = null;
  #tickCount = 0;
  readonly #url: string;
  #onDisconnectCallback: (() => void) | null = null;
  #onEventCallback: ((evt: LoggedEvent) => void) | null = null;

  constructor(url: string) {
    this.#url = url;
  }

  onDisconnect(callback: () => void): void {
    this.#onDisconnectCallback = callback;
  }

  onEvent(callback: (evt: LoggedEvent) => void): void {
    this.#onEventCallback = callback;
  }

  get isConnected(): boolean {
    return this.#connected;
  }

  get helloOk(): HelloOkPayload | null {
    return this.#hello;
  }

  get ticks(): number {
    return this.#tickCount;
  }
  async connect(): Promise<HelloOkPayload> {
    this.disconnect(); // 建立新连接前彻底清理旧的套接字和所有悬挂的请求

    return new Promise((resolve, reject) => {
      let isSettled = false;
      const ws = new WebSocket(this.#url);
      this.#ws = ws;

      const safeReject = (err: Error) => {
        if (isSettled) return;
        isSettled = true;
        reject(err);
      };

      const safeResolve = (payload: HelloOkPayload) => {
        if (isSettled) return;
        isSettled = true;
        resolve(payload);
      };

      ws.onopen = () => {
        // 遵循严格的握手协议：静默等待来自服务端的 connect.challenge 事件
      };

      ws.onmessage = (ev) => {
        let frame: any;
        try {
          frame = JSON.parse(ev.data as string);
        } catch {
          return; // 捕获不合法的 JSON 帧，防止客户端意外崩溃
        }

        if (!frame || typeof frame !== 'object') return;

        // 1. 广播总线事件处理
        if (frame.type === 'event') {
          this.#onEventCallback?.({
            id: this.#tickCount + Date.now() + Math.random(),
            ts: Date.now(),
            event: frame.event,
            payload: frame.payload,
          });

          if (frame.event === 'connect.challenge') {
            this.#sendReq('connect', {
              minProtocol: 1,
              maxProtocol: 1,
              client: {
                id: 'web-ui',
                version: '0.1.0',
                platform: 'web',
                mode: 'operator',
              },
              role: 'operator',
              scopes: ['operator.read', 'operator.write'],
              userAgent: 'mini-openclaw-web/0.1.0',
            })
              .then((res) => {
                if (!res.ok) {
                  safeReject(new Error(res.error?.message ?? 'connect failed'));
                  this.disconnect();
                  return;
                }
                this.#hello = res.payload as HelloOkPayload;
                this.#connected = true;
                safeResolve(this.#hello);
              })
              .catch((err) => {
                safeReject(err);
                this.disconnect();
              });
          } else if (frame.event === 'tick') {
            this.#tickCount += 1;
          }
          return;
        }

        // 2. 双向对等应答处理 (RPC Response)
        if (frame.type === 'res') {
          const pending = this.#pending.get(frame.id);
          if (pending) {
            this.#pending.delete(frame.id);
            pending.resolve(frame);
          }
        }
      };

      ws.onerror = () => {
        safeReject(new Error('WebSocket error'));
      };

      ws.onclose = () => {
        const wasConnected = this.#connected;
        this.#connected = false;
        this.#hello = null;

        // 彻底清理所有因为闪断挂起的请求，防止上层组件由于 Promise 不响应而发生卡死
        for (const [id, pending] of this.#pending.entries()) {
          pending.reject(new Error('Connection closed'));
          this.#pending.delete(id);
        }

        safeReject(new Error('WebSocket closed before handshake completed'));

        if (wasConnected) {
          this.#onDisconnectCallback?.();
        }
      };
    });
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const res = await this.#sendReq(method, params);
    if (!res.ok) {
      throw new Error(res.error?.message ?? `${method} failed`);
    }
    return res.payload as T;
  }

  disconnect(): void {
    if (this.#ws) {
      this.#ws.onopen = null;
      this.#ws.onmessage = null;
      this.#ws.onerror = null;
      this.#ws.onclose = null;
      try {
        this.#ws.close();
      } catch {
        // 静默捕获套接字关闭异常
      }
      this.#ws = null;
    }

    this.#connected = false;
    this.#hello = null;

    // 清空挂起的 RPC 队列
    for (const pending of this.#pending.values()) {
      pending.reject(new Error('Client disconnected'));
    }
    this.#pending.clear();
  }

  #sendReq(method: string, params?: unknown): Promise<ResFrame> {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket not open'));
    }

    const id = randomId();
    const frame: ReqFrame = { type: 'req', id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.#pending.has(id)) {
          this.#pending.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 10_000);

      this.#pending.set(id, {
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.#ws!.send(JSON.stringify(frame));
    });
  }
}
