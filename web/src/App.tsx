import { useEffect, useRef, useState } from "react";
import { GatewayClient } from "./gateway-client";
import "./App.css";

const WS_URL = import.meta.env.VITE_GATEWAY_URL ?? "ws://127.0.0.1:18790";

export default function App() {
  const clientRef = useRef<GatewayClient | null>(null);
  const [connStatus, setConnStatus] = useState("idle");
  const [hello, setHello] = useState<unknown>(null);
  const [health, setHealth] = useState<unknown>(null);
  const [status, setStatus] = useState<unknown>(null);
  const [lastTick, setLastTick] = useState<string | null>(null);

  useEffect(() => {
    const client = new GatewayClient({ url: WS_URL });
    clientRef.current = client;
    client.onStatus = setConnStatus;
    client.onHello = setHello;
    client.onEvent = (event, payload) => {
      if (event !== "tick") return;
      const ts = (payload as { ts?: number } | undefined)?.ts;
      setLastTick(ts ? new Date(ts).toLocaleTimeString() : new Date().toLocaleTimeString());
    };
    client.connect();

    return () => {
      client.close();
      clientRef.current = null;
    };
  }, []);

  async function call(method: "health" | "status") {
    const client = clientRef.current;
    if (!client) return;
    const res = await client.request(method);
    const value = res.ok ? res.payload : res.error;
    if (method === "health") setHealth(value);
    else setStatus(value);
  }

  const ready = connStatus === "ready";

  return (
    <main className="page">
      <header>
        <p className="brand">Mini-OpenClaw</p>
        <h1>Gateway</h1>
        <p className="sub">状态：{connStatus}</p>
        <p className="sub">最近 tick：{lastTick ?? "还没有"}</p>
      </header>

      <section>
        <h2>hello-ok</h2>
        <pre>{hello ? JSON.stringify(hello, null, 2) : "等待握手…"}</pre>
      </section>

      <section>
        <div className="actions">
          <button type="button" onClick={() => void call("status")} disabled={!ready}>
            调用 status
          </button>
          <button type="button" onClick={() => void call("health")} disabled={!ready}>
            调用 health
          </button>
        </div>
        <h2>status</h2>
        <pre>{status ? JSON.stringify(status, null, 2) : "尚未调用"}</pre>
        <h2>health</h2>
        <pre>{health ? JSON.stringify(health, null, 2) : "尚未调用"}</pre>
      </section>
    </main>
  );
}
