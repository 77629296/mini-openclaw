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
    if (this.#ws) {
      this.#ws.close();
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.#url);
      this.#ws = ws;
      let challengeReceived = false;

      ws.onopen = () => {
        // Wait for connect.challenge, then send connect req
      };

      ws.onmessage = (ev) => {
        const frame = JSON.parse(ev.data as string) as ResFrame | EventFrame;

        if (frame.type === 'event') {
          // Log every incoming event
          this.#onEventCallback?.({
            id: this.#tickCount + Date.now(),
            ts: Date.now(),
            event: frame.event,
            payload: frame.payload,
          });

          if (frame.event === 'connect.challenge' && !challengeReceived) {
            challengeReceived = true;
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
            }).then((res) => {
              if (!res.ok) {
                reject(new Error(res.error?.message ?? 'connect failed'));
                return;
              }
              this.#hello = res.payload as HelloOkPayload;
              this.#connected = true;
              resolve(this.#hello);
            }).catch(reject);
          } else if (frame.event === 'tick') {
            this.#tickCount += 1;
          }
          return;
        }

        if (frame.type === 'res') {
          const pending = this.#pending.get(frame.id);
          if (pending) {
            this.#pending.delete(frame.id);
            pending.resolve(frame);
          }
        }
      };

      ws.onerror = () => reject(new Error('WebSocket error'));
      ws.onclose = () => {
        this.#connected = false;
        this.#hello = null;
        this.#onDisconnectCallback?.();
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
    this.#ws?.close();
    this.#ws = null;
    this.#connected = false;
    this.#hello = null;
  }

  #sendReq(method: string, params?: unknown): Promise<ResFrame> {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket not open'));
    }

    const id = randomId();
    const frame: ReqFrame = { type: 'req', id, method, params };

    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws!.send(JSON.stringify(frame));

      setTimeout(() => {
        if (this.#pending.has(id)) {
          this.#pending.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 10_000);
    });
  }
}
