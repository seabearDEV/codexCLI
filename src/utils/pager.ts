import { spawn } from 'child_process';

/**
 * Buffers all stdout output produced by `fn`, then either writes it directly
 * (short output) or pipes it through a pager (long output).
 *
 * Pager resolution: CCLI_PAGER env → PAGER env → "less -FRX"
 * Skips paging entirely when stdout is not a TTY (piped output).
 */
export async function withPager(fn: () => void | Promise<void>): Promise<void> {
  // If not a TTY, just run directly — no buffering needed
  if (!process.stdout.isTTY) {
    await fn();
    return;
  }

  const chunks: (string | Uint8Array)[] = [];
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalWrite = process.stdout.write;

  // Monkey-patch stdout.write to capture output
  process.stdout.write = function (
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
    callback?: (err?: Error) => void
  ): boolean {
    chunks.push(chunk);
    // Call the appropriate callback to avoid stalling callers that wait on it
    const cb = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    if (cb) cb();
    return true;
  } as typeof process.stdout.write;

  try {
    await fn();
  } finally {
    // Always restore original write
    process.stdout.write = originalWrite;
  }

  const buffer = chunks
    .map(c => (typeof c === 'string' ? c : Buffer.from(c).toString()))
    .join('');

  // Count newlines to decide whether to page
  let lineCount = 0;
  for (const ch of buffer) {
    if (ch === '\n') lineCount++;
  }

  const rows = process.stdout.rows || 24;

  if (lineCount <= rows - 5) {
    originalWrite.call(process.stdout, buffer);
    return;
  }

  // Spawn pager
  const pagerCmd = process.env.CCLI_PAGER ?? process.env.PAGER ?? 'less -FRX';
  const parts = pagerCmd.split(/\s+/);
  const pagerBin = parts[0];
  const pagerArgs = parts.slice(1);

  return new Promise<void>((resolve) => {
    const child = spawn(pagerBin, pagerArgs, {
      stdio: ['pipe', process.stdout, process.stderr],
    });

    child.on('error', () => {
      // If pager fails (e.g. less not found), fall back to direct output
      originalWrite.call(process.stdout, buffer);
      resolve();
    });

    child.on('close', () => {
      resolve();
    });

    child.stdin.on('error', () => {
      // Ignore broken pipe — pager may exit early
    });

    child.stdin.end(buffer);
  });
}
