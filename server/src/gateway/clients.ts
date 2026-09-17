import type { WebSocket } from "ws";
import type { EventFrame } from "../protocol/types.js";

const clients = new Set<WebSocket>();

export function addClient(socket: WebSocket): void {
  clients.add(socket);
}

export function removeClient(socket: WebSocket): void {
  clients.delete(socket);
}

export function broadcastEvent(frame: EventFrame): void {
  const raw = JSON.stringify(frame);
  for (const socket of clients) {
    if (socket.readyState === socket.OPEN) {
      socket.send(raw);
    }
  }
}
