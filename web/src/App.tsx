import { useEffect, useRef, useState } from "react";
import { GatewayClient } from "./gateway-client";
import "./App.css";

const WS_URL = import.meta.env.VITE_GATEWAY_URL ?? "ws://127.0.0.1:18790";

export default function App() {
  const clientRef = useRef<GatewayClient | null>(null);
  const [status, setStatus] = useState("idle");
  const [hello, setHello] = useState<unknown>(null);
  const [health, setHealth] = useState<unknown>(null);

  useEffect(() => {
    const client = new GatewayClient({ url: WS_URL });
    clientRef.current = client;
    client.onStatus = setStatus;
    client.onHello = setHello;
    client.connect();

    return () => {
      client.close();
      clientRef.current = null;
    };
  }, []);

  async function pingHealth() {
    const client = clientRef.current;
    if (!client) return;
    const res = await client.request("health");
    setHealth(res.ok ? res.payload : res.error);
  }

  return (
    <main className="page">
      <header>
        <p className="brand">Mini-OpenClaw</p>
        <h1>Day 1 Gateway</h1>
        <p className="sub">状态：{status}</p>
      </header>

      <section>
        <h2>hello-ok</h2>
        <pre>{hello ? JSON.stringify(hello, null, 2) : "等待握手…"}</pre>
      </section>

      <section>
        <button type="button" onClick={() => void pingHealth()} disabled={status !== "ready"}>
          调用 health
        </button>
        <pre>{health ? JSON.stringify(health, null, 2) : "尚未调用"}</pre>
      </section>
    </main>
  );
}
