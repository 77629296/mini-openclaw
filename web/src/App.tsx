import { useEffect, useState } from 'react';

export default function App() {
  const [status, setStatus] = useState('连接中...');

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');
    ws.onopen = () => setStatus('已连接到 Claw 后端');
    ws.onmessage = (e) => console.log('收到后端响应:', e.data);
    return () => ws.close();
  }, []);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
      <div className="rounded-lg bg-slate-800 p-6 shadow-xl border border-slate-700">
        <h1 className="text-xl font-bold text-emerald-400">Mini-OpenClaw WebUI</h1>
        <p className="mt-2 text-sm text-slate-400">服务状态: <span className="font-mono text-white">{status}</span></p>
      </div>
    </div>
  );
}
