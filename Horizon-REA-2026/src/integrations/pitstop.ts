// Cliente MCP para el servidor Pitstop F1 (circuitos, resultados, telemetría).
//
// El endpoint es un servidor MCP "Streamable HTTP" (FastMCP sobre uvicorn) y
// exige dos cosas que rompían el cliente anterior:
//   1. Accept DEBE declarar ambos tipos: application/json y text/event-stream.
//      Sin esto el servidor responde 406 Not Acceptable.
//   2. La respuesta llega como Server-Sent Events (text/event-stream), no como
//      JSON plano, así que hay que leer los eventos `data:` y quedarse con el
//      mensaje JSON-RPC cuyo id coincide con la petición.
// Además el handshake es initialize -> notifications/initialized, y la sesión
// se conserva en la cabecera Mcp-Session-Id.

const PITSTOP_URL = "https://praneeth1025-pitstop.hf.space/mcp";
const PROTOCOL_VERSION = "2025-06-18";
const ACCEPT = "application/json, text/event-stream";
const DEFAULT_TIMEOUT_MS = 20000;

export interface PitstopTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface PitstopServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
  instructions?: string;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string };
}

let rpcId = 0;
let sessionId: string | null = null;
let initPromise: Promise<void> | null = null;
let serverInfo: PitstopServerInfo | null = null;

/** Extract every JSON payload from an SSE body ("data: {...}" lines). */
function parseSseEvents(text: string): JsonRpcMessage[] {
  const messages: JsonRpcMessage[] = [];
  let dataLines: string[] = [];

  const flush = (): void => {
    if (dataLines.length === 0) return;
    const raw = dataLines.join("\n").trim();
    dataLines = [];
    if (!raw) return;
    try {
      messages.push(JSON.parse(raw) as JsonRpcMessage);
    } catch {
      // Ignore non-JSON keep-alive payloads.
    }
  };

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    } else if (line.trim() === "") {
      flush();
    }
  }
  flush();
  return messages;
}

function pickMessage(messages: JsonRpcMessage[], id: number): JsonRpcMessage | undefined {
  return (
    messages.find((m) => m.id === id) ??
    messages.find((m) => m.result !== undefined || m.error !== undefined) ??
    messages[messages.length - 1]
  );
}

/** Read an SSE response until the reply for `id` arrives, then stop reading. */
async function readEventStream(res: Response, id: number): Promise<JsonRpcMessage | undefined> {
  const body = res.body;
  if (!body) {
    const text = await res.text();
    return pickMessage(parseSseEvents(text), id);
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const reply = pickMessage(parseSseEvents(buffer), id);
        if (reply) return reply;
      }
      if (done) break;
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }

  buffer += decoder.decode();
  return pickMessage(parseSseEvents(buffer), id);
}

async function rpc(
  method: string,
  params?: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<unknown> {
  const id = ++rpcId;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: ACCEPT
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  try {
    const res = await fetch(PITSTOP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }),
      signal: controller.signal
    });

    const sid = res.headers.get("mcp-session-id");
    if (sid) sessionId = sid;

    // Notifications are acknowledged with 202 and an empty body.
    if (res.status === 202) return undefined;

    const contentType = res.headers.get("content-type") ?? "";
    let message: JsonRpcMessage | undefined;
    if (contentType.includes("text/event-stream")) {
      message = await readEventStream(res, id);
    } else {
      const raw = (await res.text()).trim();
      message = raw ? (JSON.parse(raw) as JsonRpcMessage) : undefined;
    }

    if (!res.ok) {
      const detail = message?.error?.message ? `: ${message.error.message}` : "";
      throw new Error(`Pitstop HTTP ${res.status}${detail}`);
    }
    if (message?.error) {
      throw new Error(message.error.message ?? "Pitstop JSON-RPC error");
    }
    return message?.result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Pitstop: tiempo de espera agotado (${method})`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** JSON-RPC notification: no `id`, no reply body (server answers 202). */
async function notify(method: string, params?: unknown): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: ACCEPT
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(PITSTOP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method, params: params ?? {} })
  });
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  // 202 Accepted is the expected answer; do not fail the handshake on edge cases.
}

/** Handshake once per session; concurrent callers share the same promise. */
async function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const result = (await rpc("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        clientInfo: { name: "horizon-el-salvador", version: "0.1.0" }
      })) as
        | {
            protocolVersion?: string;
            serverInfo?: { name?: string; version?: string };
            instructions?: string;
          }
        | undefined;

      serverInfo = {
        name: result?.serverInfo?.name ?? "Pitstop F1",
        version: result?.serverInfo?.version ?? "unknown",
        protocolVersion: result?.protocolVersion ?? PROTOCOL_VERSION,
        instructions: result?.instructions
      };

      await notify("notifications/initialized");
    })().catch((error) => {
      // Allow a retry on the next call instead of caching the failure.
      initPromise = null;
      sessionId = null;
      throw error;
    });
  }
  return initPromise;
}

export const pitstop = {
  /** Handshake against the MCP server. Safe to call repeatedly. */
  async initialize(): Promise<PitstopServerInfo> {
    await ensureInitialized();
    return serverInfo ?? { name: "Pitstop F1", version: "unknown", protocolVersion: PROTOCOL_VERSION };
  },

  info(): PitstopServerInfo | null {
    return serverInfo;
  },

  isConnected(): boolean {
    return initPromise !== null && serverInfo !== null;
  },

  async listTools(): Promise<PitstopTool[]> {
    await ensureInitialized();
    const result = (await rpc("tools/list")) as { tools?: PitstopTool[] } | undefined;
    return result?.tools ?? [];
  },

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    await ensureInitialized();
    const result = await rpc("tools/call", { name, arguments: args }, 45000);
    // The server reports upstream/data failures inside the result payload.
    if (result && typeof result === "object" && (result as { isError?: boolean }).isError) {
      throw new Error(toolText(result).replace(/^\[[^\]]+\]\s*/, "") || `Fallo en la herramienta ${name}`);
    }
    return result;
  },

  // ---- Atajos tipados para Horizon El Salvador -------------------------

  async getCircuits(year?: number) {
    return this.callTool("get_reference_data", { reference_type: "circuit", year });
  },

  async getSchedule(year: number) {
    return this.callTool("get_schedule", { year });
  },

  async getTelemetry(year: number, gp: string, session = "R", drivers: string[] = []) {
    return this.callTool("get_telemetry_data", { year, gp, session, drivers });
  },

  async getStandings(year: number, type: "drivers" | "constructors" = "drivers") {
    return this.callTool("get_standings", { year, type });
  },

  async getRaceResults(year: number, round?: number) {
    return this.callTool("get_results", { year, round, result_type: "race" });
  },

  async getF1News(limit = 10) {
    return this.callTool("get_f1_news", { limit });
  }
};

/**
 * MCP tool results wrap their payload as `content: [{ type, text }]`.
 * Join the text parts so callers get plain text or an object.
 */
export function toolText(result: unknown): string {
  if (!result || typeof result !== "object") return String(result ?? "");
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text ?? "").join("\n");
  }
  return JSON.stringify(result);
}
