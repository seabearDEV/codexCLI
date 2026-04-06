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
  project?: string | undefined;
  duration?: number | undefined;
  hit?: boolean | undefined;
  redundant?: boolean | undefined;
  responseSize?: number | undefined;
  agent?: string | undefined;
}

// One session ID per MCP server process
const sessionId = crypto.randomBytes(4).toString('hex');

const pendingWrites: Promise<void>[] = [];

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
export interface TelemetryExtras {
  project?: string | undefined;
  duration?: number | undefined;
  hit?: boolean | undefined;
  redundant?: boolean | undefined;
  responseSize?: number | undefined;
}

export function logToolCall(tool: string, key?: string, source: 'mcp' | 'cli' = 'mcp', scope?: 'project' | 'global', extras?: TelemetryExtras, sync = false): Promise<void> {
  const entry: TelemetryEntry = {
    ts: Date.now(),
    tool,
    session: sessionId,
    op: classifyOp(tool),
    ns: extractNamespace(key),
    src: source,
    scope,
    agent: process.env.CODEX_AGENT_NAME ?? undefined,
    ...extras,
  };
  const line = JSON.stringify(entry) + '\n';
  if (sync) {
    try { fs.appendFileSync(getTelemetryPath(), line, { mode: 0o600 }); } catch { /* best-effort */ }
    return Promise.resolve();
  }
  const p = new Promise<void>((resolve) => {
    fs.appendFile(getTelemetryPath(), line, { mode: 0o600 }, () => resolve());
  });
  pendingWrites.push(p);
  return p;
}

export async function flushTelemetry(): Promise<void> {
  await Promise.all(pendingWrites);
  pendingWrites.length = 0;
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
  // New metrics
  hitRate: number | undefined;
  hits: number;
  misses: number;
  redundantRate: number | undefined;
  redundantWrites: number;
  avgSessionCalls: number | undefined;
  avgSessionDurationMs: number | undefined;
  totalResponseBytes: number;
  avgResponseBytes: number | undefined;
  avgDurationMs: number | undefined;
  projectBreakdown: Record<string, number>;
  // Token savings
  estimatedTokensSaved: number;
  estimatedTokensSavedBootstrap: number;
  // Agent breakdown
  agentBreakdown: Record<string, { calls: number; reads: number; writes: number }>;
  // Trend comparison (vs previous period)
  trend: TelemetryTrend | undefined;
}

export interface TelemetryTrend {
  callsDelta: number | undefined;       // percentage change
  sessionsDelta: number | undefined;
  hitRateDelta: number | undefined;     // absolute change in percentage points
  avgDurationDelta: number | undefined; // percentage change
}

/** Compute percentage change: (current - previous) / previous * 100 */
function pctChange(current: number, previous: number): number | undefined {
  if (previous === 0) return current > 0 ? 100 : undefined;
  return ((current - previous) / previous) * 100;
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

  // Project breakdown
  const projectBreakdown: Record<string, number> = {};
  for (const e of entries) {
    if (e.project) {
      projectBreakdown[e.project] = (projectBreakdown[e.project] ?? 0) + 1;
    }
  }

  // Hit/miss rate (reads with hit field set)
  const readsWithHit = entries.filter(e => e.op === 'read' && e.hit !== undefined);
  const hits = readsWithHit.filter(e => e.hit === true).length;
  const misses = readsWithHit.filter(e => e.hit === false).length;
  const hitRate = readsWithHit.length > 0 ? hits / readsWithHit.length : undefined;

  // Redundant write rate
  const writesWithRedundant = entries.filter(e => e.op === 'write' && e.redundant !== undefined);
  const redundantWrites = writesWithRedundant.filter(e => e.redundant === true).length;
  const redundantRate = writes > 0 ? redundantWrites / writes : undefined;

  // Avg session calls
  const avgSessionCalls = mcpSessionData.size > 0 ? mcpEntries.length / mcpSessionData.size : undefined;

  // Avg session duration (ms between first and last call per session)
  const sessionDurations: number[] = [];
  for (const [, calls] of mcpSessionData) {
    if (calls.length < 2) continue;
    const sorted = [...calls].sort((a, b) => a.ts - b.ts);
    sessionDurations.push(sorted[sorted.length - 1].ts - sorted[0].ts);
  }
  const avgSessionDurationMs = sessionDurations.length > 0
    ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length
    : undefined;

  // Token-efficiency: total and avg response bytes
  const responseSizes = entries.filter(e => e.responseSize !== undefined).map(e => e.responseSize!);
  const totalResponseBytes = responseSizes.reduce((a, b) => a + b, 0);
  const avgResponseBytes = responseSizes.length > 0 ? totalResponseBytes / responseSizes.length : undefined;

  // Avg duration
  const durations = entries.filter(e => e.duration !== undefined).map(e => e.duration!);
  const avgDurationMs = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : undefined;

  const mcpSessions = mcpSessionData.size;
  const period = periodDays > 0 ? `${periodDays}d` : 'all';

  // Token savings estimate: response bytes from cache hits / ~4 bytes per token
  const estimatedTokensSaved = Math.round(
    entries
      .filter(e => e.op === 'read' && e.hit === true && e.responseSize !== undefined)
      .reduce((sum, e) => sum + e.responseSize!, 0) / 4
  );
  const estimatedTokensSavedBootstrap = Math.round(
    entries
      .filter(e => e.tool === 'codex_context' && e.hit === true && e.responseSize !== undefined)
      .reduce((sum, e) => sum + e.responseSize!, 0) / 4
  );

  // Agent breakdown
  const agentBreakdown: Record<string, { calls: number; reads: number; writes: number }> = {};
  for (const e of entries) {
    const agent = e.agent;
    if (!agent) continue;
    if (!agentBreakdown[agent]) agentBreakdown[agent] = { calls: 0, reads: 0, writes: 0 };
    agentBreakdown[agent].calls++;
    if (e.op === 'read') agentBreakdown[agent].reads++;
    if (e.op === 'write') agentBreakdown[agent].writes++;
  }

  // Trend comparison: compute stats for the previous period of the same length
  let trend: TelemetryTrend | undefined;
  if (periodDays > 0 && cutoff > 0) {
    const prevCutoff = cutoff - periodDays * 86400000;
    const prevEntries = all.filter(e => e.ts >= prevCutoff && e.ts < cutoff);
    if (prevEntries.length > 0) {
      const prevMcpEntries = prevEntries.filter(e => e.src !== 'cli');
      const prevSessions = new Set(prevMcpEntries.map(e => e.session)).size;
      const prevReadsWithHit = prevEntries.filter(e => e.op === 'read' && e.hit !== undefined);
      const prevHits = prevReadsWithHit.filter(e => e.hit === true).length;
      const prevHitRate = prevReadsWithHit.length > 0 ? prevHits / prevReadsWithHit.length : undefined;
      const prevDurations = prevEntries.filter(e => e.duration !== undefined).map(e => e.duration!);
      const prevAvgDuration = prevDurations.length > 0
        ? prevDurations.reduce((a, b) => a + b, 0) / prevDurations.length
        : undefined;

      trend = {
        callsDelta: pctChange(entries.length, prevEntries.length),
        sessionsDelta: pctChange(mcpSessions, prevSessions),
        hitRateDelta: hitRate !== undefined && prevHitRate !== undefined
          ? (hitRate - prevHitRate) * 100  // absolute pp change
          : undefined,
        avgDurationDelta: avgDurationMs !== undefined && prevAvgDuration !== undefined
          ? pctChange(avgDurationMs, prevAvgDuration)
          : undefined,
      };
    }
  }

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
    hitRate,
    hits,
    misses,
    redundantRate,
    redundantWrites,
    avgSessionCalls,
    avgSessionDurationMs,
    totalResponseBytes,
    avgResponseBytes,
    avgDurationMs,
    projectBreakdown,
    estimatedTokensSaved,
    estimatedTokensSavedBootstrap,
    agentBreakdown,
    trend,
  };
}
