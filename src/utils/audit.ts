import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDataDirectory } from './paths';
import { classifyOp } from './telemetry';
import { isEncrypted } from './crypto';

export interface AuditEntry {
  ts: number;
  session: string;
  src: 'mcp' | 'cli';
  tool: string;
  op: 'read' | 'write' | 'exec' | 'meta';
  key?: string | undefined;
  scope?: string | undefined;
  success: boolean;
  before?: string | undefined;
  after?: string | undefined;
  error?: string | undefined;
  params?: Record<string, unknown> | undefined;
  agent?: string | undefined;
}

export interface AuditQueryOptions {
  key?: string | undefined;
  periodDays?: number | undefined;
  writesOnly?: boolean | undefined;
  limit?: number | undefined;
}

const sessionId = crypto.randomBytes(4).toString('hex');

function getAuditPath(): string {
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
    } else if (typeof v === 'string' && v.length > MAX_VALUE_LENGTH) {
      result[k] = v.slice(0, MAX_VALUE_LENGTH) + '...[truncated]';
    } else {
      result[k] = v;
    }
  }
  return result;
}

export function logAudit(partial: Omit<AuditEntry, 'ts' | 'session' | 'agent'>): Promise<void> {
  const entry: AuditEntry = {
    ...partial,
    ts: Date.now(),
    session: sessionId,
    agent: process.env.CODEX_AGENT_NAME || undefined,
  };
  return new Promise<void>((resolve) => {
    fs.appendFile(getAuditPath(), JSON.stringify(entry) + '\n', (_err) => resolve());
  });
}

function pushAuditLine(entries: AuditEntry[], line: string): void {
  if (!line.trim()) return;
  try {
    entries.push(JSON.parse(line) as AuditEntry);
  } catch {
    // Skip malformed lines
  }
}

export function loadAuditLog(): AuditEntry[] {
  const chunkSize = 64 * 1024;
  const entries: AuditEntry[] = [];

  try {
    const fd = fs.openSync(getAuditPath(), 'r');
    const buffer = Buffer.alloc(chunkSize);
    let remainder = '';

    try {
      let bytesRead: number;
      do {
        bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
        if (bytesRead <= 0) break;

        const chunk = remainder + buffer.toString('utf8', 0, bytesRead);
        const lines = chunk.split('\n');
        remainder = lines.pop() ?? '';

        for (const line of lines) {
          pushAuditLine(entries, line);
        }
      } while (bytesRead === buffer.length);

      if (remainder) {
        pushAuditLine(entries, remainder);
      }

      return entries;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}

export function queryAuditLog(options: AuditQueryOptions = {}): AuditEntry[] {
  const all = loadAuditLog();
  const cutoff = options.periodDays && options.periodDays > 0
    ? Date.now() - options.periodDays * 86400000
    : 0;
  const limit = options.limit ?? 50;

  let filtered = all;

  if (cutoff > 0) {
    filtered = filtered.filter(e => e.ts >= cutoff);
  }

  if (options.key) {
    const prefix = options.key + '.';
    filtered = filtered.filter(e => e.key === options.key || e.key?.startsWith(prefix));
  }

  if (options.writesOnly) {
    filtered = filtered.filter(e => e.op === 'write');
  }

  // Newest first
  filtered.sort((a, b) => b.ts - a.ts);

  return filtered.slice(0, limit);
}

export { classifyOp };
