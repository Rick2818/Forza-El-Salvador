// Cliente ligero para el MCP Pitstop (Formula 1: circuitos, carros, telemetría).
// Endpoint público hosted (Hugging Face). Protocolo: JSON-RPC 2.0 sobre HTTP POST.
// Uso: import { pitstop } from "./integrations/pitstop"; await pitstop.getCircuits();

const PITSTOP_URL = "https://praneeth1025-pitstop.hf.space/mcp";

let rpcId = 0;
let sessionId: string | null = null;

async function rpc(method: string, params?: unknown): Promise<unknown> {
  const body = {
    jsonrpc: "2.0",
    id: ++rpcId,
    method,
    params: params ?? {},
  };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(PITSTOP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Pitstop HTTP ${res.status}`);
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

export const pitstop = {
  async initialize(): Promise<void> {
    await rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "horizon-el-salvador", version: "0.1.0" },
    });
    await rpc("notifications/initialized");
  },

  async listTools(): Promise<unknown> {
    return rpc("tools/list");
  },

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return rpc("tools/call", { name, arguments: args });
  },

  // Atajos tipados para Horizon El Salvador
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
  },
};

// Auto-inicializar al importar (no bloqueante)
pitstop.initialize().catch((e) => console.warn("[Pitstop] init failed:", e));
