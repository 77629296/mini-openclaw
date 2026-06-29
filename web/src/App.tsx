import { useEffect, useState } from 'react';
import { GatewayClient } from './gateway-client';

interface GatewayInfo {
  connId: string;
  protocol: number;
  uptime: number;
  connections: number;
  ticks: number;
}

// 提取网络请求的响应接口类型，提升可读性
interface HealthResponse {
  uptime: number;
}

interface StatusResponse {
  connections: number;
  protocol: number;
  gateway: { connId: string; uptime: number };
}

export default function App() {
  const [status, setStatus] = useState('连接中...');
  const [info, setInfo] = useState<GatewayInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true; // 用于防止异步竞态条件
    const client = new GatewayClient('ws://localhost:8080');
    let tickTimer: ReturnType<typeof setInterval> | null = null;

    const initGateway = async () => {
      try {
        // 并发执行无依赖的 health 和 status 请求，缩短连接耗时
        const hello = await client.connect();
        const [health, gatewayStatus] = await Promise.all([
          client.request<HealthResponse>('health'),
          client.request<StatusResponse>('status'),
        ]);

        if (!isMounted) return;

        setStatus('已握手 (hello-ok)');
        setInfo({
          connId: hello.server.connId,
          protocol: hello.protocol,
          uptime: health.uptime,
          connections: gatewayStatus.connections,
          ticks: client.ticks,
        });

        tickTimer = setInterval(() => {
          if (isMounted) {
            setInfo((prev) => (prev ? { ...prev, ticks: client.ticks } : prev));
          }
        }, 1000);
      } catch (err) {
        if (!isMounted) return;
        setStatus('连接失败');
        setError(err instanceof Error ? err.message : '未知错误');
      }
    };

    initGateway();

    return () => {
      isMounted = false;
      if (tickTimer) clearInterval(tickTimer);
      client.disconnect();
    };
  }, []);

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
