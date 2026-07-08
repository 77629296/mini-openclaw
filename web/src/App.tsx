import { useEffect, useState, useRef, useCallback } from 'react';
import { GatewayClient } from './gateway-client';

const WS_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_GATEWAY_WS_URL ?? 'ws://localhost:8080';

interface GatewayInfo {
  connId: string;
  protocol: number;
  uptime: number;
  connections: number;
  ticks: number;
  role: string;
  scopes: string[];
}

interface HealthResponse {
  uptime: number;
}

interface StatusResponse {
  connections: number;
  protocol: number;
  gateway: { connId: string; uptime: number };
}

interface WhoamiResponse {
  connId: string;
  role: 'operator' | 'node';
  scopes: string[];
  protocol: number;
  connectedAt: number;
}

const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_ATTEMPTS = 10;

export default function App() {
  const [status, setStatus] = useState('连接中...');
  const [info, setInfo] = useState<GatewayInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const initGateway = useCallback(async (client: GatewayClient) => {
    try {
      const hello = await client.connect();
      const [health, gatewayStatus, whoami] = await Promise.all([
        client.request<HealthResponse>('health'),
        client.request<StatusResponse>('status'),
        client.request<WhoamiResponse>('whoami'),
      ]);

      reconnectAttemptsRef.current = 0;
      setStatus('已握手 (hello-ok)');
      setInfo({
        connId: whoami.connId,
        protocol: whoami.protocol,
        uptime: health.uptime,
        connections: gatewayStatus.connections,
        ticks: client.ticks,
        role: whoami.role,
        scopes: whoami.scopes,
      });
      setError(null);
    } catch (err) {
      setStatus('连接失败');
      setError(err instanceof Error ? err.message : '未知错误');
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const client = new GatewayClient(WS_URL);
    let tickTimer: ReturnType<typeof setInterval> | null = null;

    client.onDisconnect(() => {
      if (!isMounted) return;
      clearInterval(tickTimer);
      tickTimer = null;

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current += 1;
        setStatus(
          `连接断开，${RECONNECT_DELAY_MS / 1000}s 后重连 (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`,
        );
        setTimeout(() => {
          if (isMounted) {
            initGateway(client).then(() => {
              if (isMounted && client.isConnected) {
                tickTimer = setInterval(() => {
                  if (isMounted) {
                    setInfo((prev) =>
                      prev ? { ...prev, ticks: client.ticks } : prev,
                    );
                  }
                }, 1000);
              }
            });
          }
        }, RECONNECT_DELAY_MS);
      } else {
        setStatus('连接失败（已达最大重试次数）');
        setError('无法连接到 Gateway');
      }
    });

    initGateway(client).then(() => {
      if (isMounted && client.isConnected) {
        tickTimer = setInterval(() => {
          if (isMounted) {
            setInfo((prev) =>
              prev ? { ...prev, ticks: client.ticks } : prev,
            );
          }
        }, 1000);
      }
    });

    return () => {
      isMounted = false;
      if (tickTimer) clearInterval(tickTimer);
      client.disconnect();
    };
  }, [initGateway]);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
      <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
        <h1 className="text-xl font-bold text-emerald-400">Mini-OpenClaw WebUI</h1>
        <p className="mt-2 text-sm text-slate-400">
          协议状态: <span className="font-mono text-white">{status}</span>
        </p>

        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

        {info && (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">connId</dt>
              <dd className="font-mono text-xs">{info.connId.slice(0, 8)}…</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">protocol</dt>
              <dd className="font-mono">v{info.protocol}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">role</dt>
              <dd className="font-mono">{info.role}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">scopes</dt>
              <dd className="font-mono text-xs">{info.scopes.join(', ')}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">uptime</dt>
              <dd className="font-mono">{Math.round(info.uptime / 1000)}s</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">connections</dt>
              <dd className="font-mono">{info.connections}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">tick events</dt>
              <dd className="font-mono">{info.ticks}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
