import crypto from 'crypto';

/**
 * Single shared session identifier for the current process. Generated once
 * at module load time and reused by every observability subsystem (audit
 * log, telemetry, miss-path tracker) so that entries from the same process
 * can be cross-referenced by `session` field.
 *
 * Prior to v1.11.x, audit and telemetry each generated their own independent
 * sessionId. Same operation, different session IDs in the two log files —
 * which made cross-log analysis silently broken. The fix is structural: a
 * single source of truth that everyone imports from.
 *
 * 8 hex chars (4 random bytes) is enough to disambiguate concurrent
 * processes on a typical user machine without bloating every log line.
 */
const sessionId = crypto.randomBytes(4).toString('hex');

export function getSessionId(): string {
  return sessionId;
}
