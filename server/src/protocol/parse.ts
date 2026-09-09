import type { Frame } from "./types.js";

export function parseFrame(raw: string): Frame | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!data || typeof data !== "object") return null;
  const frame = data as Record<string, unknown>;

  if (frame.type === "req") {
    if (typeof frame.id !== "string" || typeof frame.method !== "string") return null;
    return {
      type: "req",
      id: frame.id,
      method: frame.method,
      params: frame.params,
    };
  }

  if (frame.type === "res") {
    if (typeof frame.id !== "string" || typeof frame.ok !== "boolean") return null;
    return {
      type: "res",
      id: frame.id,
      ok: frame.ok,
      payload: frame.payload,
      error: frame.error as { code: string; message: string } | undefined,
    };
  }

  if (frame.type === "event") {
    if (typeof frame.event !== "string") return null;
    return {
      type: "event",
      event: frame.event,
      payload: frame.payload,
    };
  }

  return null;
}
