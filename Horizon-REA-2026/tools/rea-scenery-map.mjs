// Builds a human-readable map of the scenery code from a REA evidence bundle.
// Usage: node tools/rea-scenery-map.mjs <bundle.json> [evidence-prefix] [out.md]
import { readFileSync, writeFileSync } from "node:fs";

const bundlePath = process.argv[2];
const prefix = process.argv[3] ?? "ev_823ec0eb";
const outPath = process.argv[4];

if (!bundlePath) {
  console.error("usage: node tools/rea-scenery-map.mjs <bundle.json> [prefix] [out.md]");
  process.exit(1);
}

const root = JSON.parse(readFileSync(bundlePath, "utf8")).result ?? JSON.parse(readFileSync(bundlePath, "utf8"));
const record = (root.records ?? []).find((r) => r.evidence_id.startsWith(prefix));
if (!record) throw new Error(`record ${prefix} not found in bundle`);

let nr = record.normalized_result;
if (typeof nr === "string") nr = JSON.parse(nr);
const sg = nr.semantic_graph;
const stats = nr.statistics ?? {};
const byId = new Map(sg.nodes.map((n) => [n.node_id, n]));
const fnById = new Map(sg.nodes.filter((n) => n.kind === "function").map((n) => [n.node_id, n]));

const moduleOf = (n) => n?.identity?.module_path ?? "?";
const fnName = (n) => n?.properties?.name ?? n?.label ?? "?";

const functionsByModule = new Map();
for (const n of sg.nodes) {
  if (n.kind !== "function") continue;
  const m = moduleOf(n);
  if (!functionsByModule.has(m)) functionsByModule.set(m, []);
  functionsByModule.get(m).push(fnName(n));
}
for (const list of functionsByModule.values()) list.sort();

const edges = [];
for (const r of sg.relations) {
  if (r.relation !== "calls") continue;
  const site = byId.get(r.source_node_id);
  const callee = byId.get(r.target_node_id);
  if (!site || !callee || callee.kind !== "function") continue;
  const caller = site.function_node_id ? fnById.get(site.function_node_id) : null;
  edges.push({
    caller: caller ? `${moduleOf(caller)}::${fnName(caller)}` : `(top-level)::${moduleOf(site)}`,
    callee: `${moduleOf(callee)}::${fnName(callee)}`,
    resolution: r.resolution ?? "unknown",
    line: site.identity?.source_range?.start?.line ?? 0
  });
}

const callsByCaller = new Map();
for (const e of edges) {
  if (!callsByCaller.has(e.caller)) callsByCaller.set(e.caller, []);
  callsByCaller.get(e.caller).push(e);
}
for (const list of callsByCaller.values()) {
  list.sort((a, b) => a.callee.localeCompare(b.callee) || a.line - b.line);
}

const resolved = edges.filter((e) => e.resolution === "resolved").length;
const candidate = edges.filter((e) => e.resolution === "candidate").length;
const unknown = edges.length - resolved - candidate;

const lines = [];
lines.push("# Mapa REA de la escenografía");
lines.push("");
lines.push(`- **Evidence ID:** \`${record.evidence_id}\``);
lines.push(`- **Sujeto:** \`${record.subject?.local_path ?? "?"}\``);
lines.push(`- **SHA-256:** \`${record.subject?.digest?.sha256 ?? "?"}\``);
lines.push(`- **Operación:** \`${record.operation}\``);
lines.push(`- **Autoridad:** \`${record.authority}\` · **Confianza:** \`${record.confidence}\``);
lines.push("");
lines.push("## Métricas estáticas");
lines.push("");
lines.push("| Métrica | Valor |");
lines.push("|---|---|");
lines.push(`| Archivos JS/TS parseados | ${stats.parsed_javascript_files ?? "?"} |`);
lines.push(`| Bytes de texto leídos | ${stats.text_bytes_read ?? "?"} |`);
lines.push(`| Nodos AST visitados | ${stats.visited_ast_nodes ?? "?"} |`);
lines.push(`| Fallos de parseo | ${stats.parse_failures ?? "?"} |`);
lines.push(`| Hallazgos | ${stats.findings ?? "?"} |`);
lines.push(`| Funciones identificadas | ${fnById.size} |`);
lines.push(`| Relaciones semánticas | ${sg.relations.length} |`);
lines.push(`| Incógnitas call-flow | ${sg.unknowns.length} |`);
lines.push(`| Llamadas resueltas / candidatas / otras | ${resolved} / ${candidate} / ${unknown} |`);
lines.push("");
lines.push("## Funciones por módulo");
lines.push("");
for (const [mod, list] of [...functionsByModule.entries()].sort()) {
  lines.push(`### \`${mod}\` (${list.length})`);
  lines.push("");
  lines.push(list.map((f) => `\`${f}\``).join(" · "));
  lines.push("");
}
lines.push("## Grafo de llamadas");
lines.push("");
for (const [caller, list] of [...callsByCaller.entries()].sort()) {
  lines.push(`### \`${caller}\``);
  lines.push("");
  for (const e of list) {
    lines.push(`- → \`${e.callee}\` — ${e.resolution} (línea ${e.line})`);
  }
  lines.push("");
}
lines.push("## Limitaciones declaradas por REA");
lines.push("");
for (const lim of record.limitations ?? []) lines.push(`- ${lim}`);
lines.push("");

const text = lines.join("\n");
if (outPath) {
  writeFileSync(outPath, text);
  console.log(`wrote ${outPath} (${text.length} chars)`);
} else {
  console.log(text);
}
