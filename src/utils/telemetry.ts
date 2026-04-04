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
}

// One session ID per MCP server process
const sessionId = crypto.randomBytes(4).toString('hex');

function getTelemetryPath(): string {
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
function classifyOp(tool: string): TelemetryEntry['op'] {
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
      return 'read';
    default:
      return 'meta';
  }
}

/**
 * Log an MCP tool call to the telemetry JSONL file.
 * Returns a promise for testing; callers that want fire-and-forget can ignore it.
 * Errors are silently ignored — telemetry must never break the MCP server.
 */
export function logToolCall(tool: string, key?: string): Promise<void> {
  const entry: TelemetryEntry = {
    ts: Date.now(),
    tool,
    session: sessionId,
    op: classifyOp(tool),
    ns: extractNamespace(key),
  };
  return new Promise<void>((resolve) => {
    fs.appendFile(getTelemetryPath(), JSON.stringify(entry) + '\n', (_err) => resolve());
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
  totalSessions: number;
  totalCalls: number;
  bootstrapRate: number;
  writeBackRate: number;
  reads: number;
  writes: number;
  execs: number;
  readWriteRatio: string;
  namespaceCoverage: Record<string, { reads: number; writes: number; lastWrite: number | undefined }>;
  topTools: Array<{ tool: string; count: number }>;
}

/**
 * Compute trending stats from telemetry entries.
 * @param periodDays - Number of days to analyze (0 = all time)
 */
export function computeStats(periodDays: number = 0): TelemetryStats {
  const all = loadTelemetry();
  const cutoff = periodDays > 0 ? Date.now() - periodDays * 86400000 : 0;
  const entries = cutoff > 0 ? all.filter(e => e.ts >= cutoff) : all;

  const sessions = new Set(entries.map(e => e.session));
  const sessionData = new Map<string, TelemetryEntry[]>();
  for (const e of entries) {
    if (!sessionData.has(e.session)) sessionData.set(e.session, []);
    sessionData.get(e.session)!.push(e);
  }

  // Bootstrap rate: % of sessions whose first call is codex_context
  let bootstrapped = 0;
  for (const [, calls] of sessionData) {
    const sorted = [...calls].sort((a, b) => a.ts - b.ts);
    if (sorted[0]?.tool === 'codex_context') bootstrapped++;
  }

  // Write-back rate: % of sessions with at least one write
  let wroteBack = 0;
  for (const [, calls] of sessionData) {
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

  const totalSessions = sessions.size;
  const period = periodDays > 0 ? `${periodDays}d` : 'all';

  return {
    period,
    totalSessions,
    totalCalls: entries.length,
    bootstrapRate: totalSessions > 0 ? bootstrapped / totalSessions : 0,
    writeBackRate: totalSessions > 0 ? wroteBack / totalSessions : 0,
    reads,
    writes,
    execs,
    readWriteRatio: writes > 0 ? `${(reads / writes).toFixed(1)}:1` : reads > 0 ? '∞:1' : '0:0',
    namespaceCoverage: nsCoverage,
    topTools,
  };
}
