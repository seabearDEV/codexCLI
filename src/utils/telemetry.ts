import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDataDirectory } from './paths';

export interface TelemetryEntry {
  ts: number;
  tool: string;
  session: string;
  op: 'read' | 'write' | 'exec' | 'meta';
  ns: string;
  src?: 'mcp' | 'cli';
  scope?: 'project' | 'global' | undefined;
}

// One session ID per MCP server process
const sessionId = crypto.randomBytes(4).toString('hex');

export function getTelemetryPath(): string {
  return path.join(getDataDirectory(), 'telemetry.jsonl');
}

/**
 * Extract the top-level namespace from a dot-notation key.
 * "arch.mcp" → "arch", undefined/empty → "*"
 */
function extractNamespace(key?: string): string {
  if (!key) return '*';
  const dot = key.indexOf('.');
  return dot === -1 ? key : key.slice(0, dot);
}

/**
 * Classify an MCP tool call as read, write, exec, or meta.
 */
export function classifyOp(tool: string): TelemetryEntry['op'] {
  switch (tool) {
    case 'codex_set':
    case 'codex_remove':
    case 'codex_copy':
    case 'codex_rename':
    case 'codex_import':
    case 'codex_reset':
    case 'codex_alias_set':
    case 'codex_alias_remove':
    case 'codex_config_set':
      return 'write';
    case 'codex_run':
      return 'exec';
    case 'codex_context':
    case 'codex_get':
    case 'codex_search':
    case 'codex_export':
    case 'codex_alias_list':
    case 'codex_config_get':
    case 'codex_stale':
    case 'codex_lint':
      return 'read';
    case 'codex_init':
      return 'write';
    default:
      return 'meta';
  }
}

/**
 * Log an MCP tool call to the telemetry JSONL file.
 * Returns a promise for testing; callers that want fire-and-forget can ignore it.
 * Errors are silently ignored — telemetry must never break the MCP server.
 */
export function logToolCall(tool: string, key?: string, source: 'mcp' | 'cli' = 'mcp', scope?: 'project' | 'global'  ): Promise<void> {
  const entry: TelemetryEntry = {
    ts: Date.now(),
    tool,
    session: sessionId,
    op: classifyOp(tool),
    ns: extractNamespace(key),
    src: source,
    scope,
  };
  return new Promise<void>((resolve) => {
    fs.appendFile(getTelemetryPath(), JSON.stringify(entry) + '\n', { mode: 0o600 }, () => resolve());
  });
}

function pushTelemetryLine(entries: TelemetryEntry[], line: string): void {
  if (!line.trim()) return;
  try {
    entries.push(JSON.parse(line) as TelemetryEntry);
  } catch {
    // Skip malformed lines
  }
}

/**
 * Read and parse the telemetry log. Returns entries in file order
 * (oldest-first, since new entries are appended to the log).
 */
export function loadTelemetry(): TelemetryEntry[] {
  const chunkSize = 64 * 1024;
  const entries: TelemetryEntry[] = [];

  try {
    const fd = fs.openSync(getTelemetryPath(), 'r');
    const buffer = Buffer.alloc(chunkSize);
    let remainder = '';

    try {
      let bytesRead: number;
      do {
        // null position advances the fd's read offset automatically on each call
        bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
        if (bytesRead <= 0) break;

        const chunk = remainder + buffer.toString('utf8', 0, bytesRead);
        const lines = chunk.split('\n');
        remainder = lines.pop() ?? '';

        for (const line of lines) {
          pushTelemetryLine(entries, line);
        }
      } while (bytesRead === buffer.length);

      if (remainder) {
        pushTelemetryLine(entries, remainder);
      }

      return entries;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}

export interface TelemetryStats {
  period: string;
  totalCalls: number;
  mcpSessions: number;
  mcpCalls: number;
  cliCalls: number;
  bootstrapRate: number;
  writeBackRate: number;
  reads: number;
  writes: number;
  execs: number;
  readWriteRatio: string;
  namespaceCoverage: Record<string, { reads: number; writes: number; lastWrite: number | undefined }>;
  topTools: { tool: string; count: number }[];
  scopeBreakdown: { project: number; global: number; unscoped: number };
}

/**
 * Compute trending stats from telemetry entries.
 * @param periodDays - Number of days to analyze (0 = all time)
 */
export function computeStats(periodDays = 0): TelemetryStats {
  const all = loadTelemetry();
  const cutoff = periodDays > 0 ? Date.now() - periodDays * 86400000 : 0;
  const entries = cutoff > 0 ? all.filter(e => e.ts >= cutoff) : all;

  // Separate MCP and CLI entries (entries without src field are legacy MCP)
  const mcpEntries = entries.filter(e => e.src !== 'cli');
  const cliEntries = entries.filter(e => e.src === 'cli');

  // MCP session metrics (bootstrap rate, write-back rate only apply to MCP)
  const mcpSessionData = new Map<string, TelemetryEntry[]>();
  for (const e of mcpEntries) {
    if (!mcpSessionData.has(e.session)) mcpSessionData.set(e.session, []);
    mcpSessionData.get(e.session)!.push(e);
  }

  let bootstrapped = 0;
  for (const [, calls] of mcpSessionData) {
    const sorted = [...calls].sort((a, b) => a.ts - b.ts);
    if (sorted[0]?.tool === 'codex_context') bootstrapped++;
  }

  let wroteBack = 0;
  for (const [, calls] of mcpSessionData) {
    if (calls.some(c => c.op === 'write')) wroteBack++;
  }

  const reads = entries.filter(e => e.op === 'read').length;
  const writes = entries.filter(e => e.op === 'write').length;
  const execs = entries.filter(e => e.op === 'exec').length;

  // Namespace coverage
  const nsCoverage: Record<string, { reads: number; writes: number; lastWrite: number | undefined }> = {};
  for (const e of entries) {
    if (e.ns === '*') continue;
    if (!nsCoverage[e.ns]) nsCoverage[e.ns] = { reads: 0, writes: 0, lastWrite: undefined };
    if (e.op === 'read') nsCoverage[e.ns].reads++;
    if (e.op === 'write') {
      nsCoverage[e.ns].writes++;
      const prev = nsCoverage[e.ns].lastWrite;
      if (prev === undefined || e.ts > prev) nsCoverage[e.ns].lastWrite = e.ts;
    }
  }

  // Top tools
  const toolCounts = new Map<string, number>();
  for (const e of entries) {
    toolCounts.set(e.tool, (toolCounts.get(e.tool) ?? 0) + 1);
  }
  const topTools = [...toolCounts.entries()]
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Scope breakdown
  const scopeBreakdown = { project: 0, global: 0, unscoped: 0 };
  for (const e of entries) {
    if (e.scope === 'project') scopeBreakdown.project++;
    else if (e.scope === 'global') scopeBreakdown.global++;
    else scopeBreakdown.unscoped++;
  }

  const mcpSessions = mcpSessionData.size;
  const period = periodDays > 0 ? `${periodDays}d` : 'all';

  return {
    period,
    totalCalls: entries.length,
    mcpSessions,
    mcpCalls: mcpEntries.length,
    cliCalls: cliEntries.length,
    bootstrapRate: mcpSessions > 0 ? bootstrapped / mcpSessions : 0,
    writeBackRate: mcpSessions > 0 ? wroteBack / mcpSessions : 0,
    reads,
    writes,
    execs,
    readWriteRatio: writes > 0 ? `${(reads / writes).toFixed(1)}:1` : reads > 0 ? '∞:1' : '0:0',
    namespaceCoverage: nsCoverage,
    topTools,
    scopeBreakdown,
  };
}
