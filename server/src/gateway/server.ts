import { WebSocketServer } from "ws";
import type { Config } from "../config.js";
import { handleConnection } from "./connection.js";

export function startGateway(config: Config): WebSocketServer {
  const wss = new WebSocketServer({ host: config.host, port: config.port });

  wss.on("connection", (socket) => {
    handleConnection(socket, config);
  });

  wss.on("listening", () => {
    console.log(`gateway ws://${config.host}:${config.port}`);
  });

  return wss;
}
