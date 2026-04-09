import fs from 'fs';
import path from 'path';
import { getDataDirectory, findProjectFile } from './paths';
import { classifyOp } from './telemetry';
import { isEncrypted } from './crypto';
import { getSessionId } from './session';

export interface AuditEntry {
  ts: number;
  session: string;
  src: 'mcp' | 'cli';
  tool: string;
  op: 'read' | 'write' | 'exec' | 'meta';
  key?: string | undefined;
  scope?: string | undefined;
  project?: string | undefined;
  success: boolean;
  before?: string | undefined;
  after?: string | undefined;
  error?: string | undefined;
  params?: Record<string, unknown> | undefined;
  agent?: string | undefined;
  duration?: number | undefined;
  aliasResolved?: string | undefined;
  // Token-efficiency metrics
  responseSize?: number | undefined;
  requestSize?: number | undefined;
  hit?: boolean | undefined;
  tier?: string | undefined;
  entryCount?: number | undefined;
  redundant?: boolean | undefined;
}

export interface AuditQueryOptions {
  key?: string | undefined;
  periodDays?: number | undefined;
  writesOnly?: boolean | undefined;
  src?: 'mcp' | 'cli' | undefined;
  project?: string | undefined;
  hitsOnly?: boolean | undefined;
  missesOnly?: boolean | undefined;
  redundantOnly?: boolean | undefined;
  limit?: number | undefined;
}

const pendingWrites: Promise<void>[] = [];

export function getAuditPath(): string {
  return path.join(getDataDirectory(), 'audit.jsonl');
}

const MAX_VALUE_LENGTH = 500;

export function sanitizeValue(value: string | undefined, maxLen: number = MAX_VALUE_LENGTH): string | undefined {
  if (value === undefined) return undefined;
  if (isEncrypted(value)) return '[encrypted]';
  if (value.length > maxLen) return value.slice(0, maxLen) + '...[truncated]';
  return value;
}

export function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === 'password') {
      result[k] = '[redacted]';
    } else if (typeof v === 'string' && isEncrypted(v)) {
      result[k] = '[encrypted]';
    } else if (typeof v === 'string' && v.length > MAX_VALUE_LENGTH) {
      result[k] = v.slice(0, MAX_VALUE_LENGTH) + '...[truncated]';
    } else {
      result[k] = v;
    }
  }
  return result;
}

export function logAudit(partial: Omit<AuditEntry, 'ts' | 'session' | 'agent' | 'project'>, sync = false): Promise<void> {
  const projectFile = findProjectFile();
  const entry: AuditEntry = {
    ...partial,
    ts: Date.now(),
    session: getSessionId(),
    project: projectFile ? path.dirname(projectFile) : undefined,
    agent: process.env.CODEX_AGENT_NAME ?? undefined,
  };
  const line = JSON.stringify(entry) + '\n';
  if (sync) {
    try { fs.appendFileSync(getAuditPath(), line, { mode: 0o600 }); } catch { /* best-effort */ }
    return Promise.resolve();
  }
  const p = new Promise<void>((resolve) => {
    fs.appendFile(getAuditPath(), line, { mode: 0o600 }, () => resolve());
  });
  pendingWrites.push(p);
  return p;
}

export async function flushAudit(): Promise<void> {
  await Promise.all(pendingWrites);
  pendingWrites.length = 0;
}

function pushAuditLine(entries: AuditEntry[], line: string): void {
  if (!line.trim()) return;
  try {
    entries.push(JSON.parse(line) as AuditEntry);
  } catch {
    // Skip malformed lines
  }
}

// ── Incremental tail cache ─────────────────────────────────────────────
//
// audit.jsonl is append-only and grows monotonically. Re-reading the
// whole file on every loadAuditLog() call costs O(file-size) per
// invocation, which dominated the codex_audit tool's cost in v1.11.1
// manual testing — bulk-batch parallel calls froze the MCP server while
// queued audit reads serialized through the event loop.
//
// This cache holds the parsed entries plus the byte offset of the last
// successful read. Subsequent reads stat the file: if the size grew, we
// pread() just the new tail and parse only the new lines. If the size
// shrank (rotation, truncation, or test cleanup), we drop the cache and
// fall back to a full re-read on the next call.

let cachedAuditEntries: AuditEntry[] = [];
let cachedAuditSize = 0;
let cachedAuditPath = '';

/** Reset the in-memory audit cache. Used by tests that swap CODEX_DATA_DIR. */
export function clearAuditLogCache(): void {
  cachedAuditEntries = [];
  cachedAuditSize = 0;
  cachedAuditPath = '';
}

export function loadAuditLog(): AuditEntry[] {
  const auditPath = getAuditPath();

  // If the audit path changed (CODEX_DATA_DIR redirect, scope swap, etc.),
  // the previous cache is for a different file — reset.
  if (auditPath !== cachedAuditPath) {
    cachedAuditEntries = [];
    cachedAuditSize = 0;
    cachedAuditPath = auditPath;
  }

  let size: number;
  try {
    size = fs.statSync(auditPath).size;
  } catch {
    // File missing — drop any stale cache and return empty.
    cachedAuditEntries = [];
    cachedAuditSize = 0;
    return [];
  }

  // File shrunk (rotation / truncation / external rewrite). The cache
  // would no longer match the on-disk prefix, so drop it and re-read
  // from byte 0.
  if (size < cachedAuditSize) {
    cachedAuditEntries = [];
    cachedAuditSize = 0;
  }

  // No new bytes — return the cached entries (a defensive copy so
  // callers that mutate the array can't pollute the cache).
  if (size === cachedAuditSize) {
    return cachedAuditEntries.slice();
  }

  // Read just the new tail and parse only its complete lines.
  const toRead = size - cachedAuditSize;
  let fd: number;
  try {
    fd = fs.openSync(auditPath, 'r');
  } catch {
    return cachedAuditEntries.slice();
  }
  try {
    const buffer = Buffer.alloc(toRead);
    let total = 0;
    while (total < toRead) {
      const n = fs.readSync(fd, buffer, total, toRead - total, cachedAuditSize + total);
      if (n <= 0) break;
      total += n;
    }
    const text = buffer.toString('utf8', 0, total);
    // Only commit complete lines: if a writer is mid-append, the trailing
    // partial line stays unparsed and will be picked up on the next read
    // once it's been flushed with its newline terminator.
    const lastNewline = text.lastIndexOf('\n');
    if (lastNewline === -1) {
      // No complete lines yet — leave cachedAuditSize unchanged.
      return cachedAuditEntries.slice();
    }
    const completeText = text.slice(0, lastNewline + 1);
    const completeBytes = Buffer.byteLength(completeText, 'utf8');
    const lines = completeText.split('\n');
    for (const line of lines) {
      pushAuditLine(cachedAuditEntries, line);
    }
    cachedAuditSize += completeBytes;
  } finally {
    fs.closeSync(fd);
  }

  return cachedAuditEntries.slice();
}

export function queryAuditLog(options: AuditQueryOptions = {}): AuditEntry[] {
  const all = loadAuditLog();
  const cutoff = options.periodDays && options.periodDays > 0
    ? Date.now() - options.periodDays * 86400000
    : 0;
  const limit = options.limit ?? 50;
  const keyPrefix = options.key ? options.key + '.' : undefined;

  const filtered = all.filter(e =>
    (cutoff <= 0 || e.ts >= cutoff) &&
    (!options.key || e.key === options.key || !!e.key?.startsWith(keyPrefix!)) &&
    (!options.writesOnly || e.op === 'write') &&
    (!options.src || e.src === options.src) &&
    (!options.project || e.project === options.project) &&
    (!options.hitsOnly || e.hit === true) &&
    (!options.missesOnly || e.hit === false) &&
    (!options.redundantOnly || e.redundant === true)
  );

  // Newest first
  filtered.sort((a, b) => b.ts - a.ts);

  return filtered.slice(0, limit);
}

export { classifyOp };
