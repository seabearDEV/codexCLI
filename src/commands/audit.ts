import { queryAuditLog, AuditEntry } from '../utils/audit';
import { parsePeriodDays } from '../utils';
import { color } from '../formatting';

export interface AuditCommandOptions {
  period?: string;
  writes?: boolean;
  mcp?: boolean;
  cli?: boolean;
  json?: boolean;
  limit?: number;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatTs(ts: number): { date: string; time: string } {
  const d = new Date(ts);
  const date = `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { date, time };
}

function shortTool(tool: string): string {
  return tool.replace(/^codex_/, '');
}

function srcLabel(entry: AuditEntry): string {
  if (entry.src === 'mcp') {
    return entry.agent ? `mcp/${entry.agent}` : 'mcp';
  }
  return 'cli';
}

function truncate(str: string, maxLen: number): string {
  if (maxLen <= 0 || str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '\u2026';
}

export function showAuditLog(key: string | undefined, options: AuditCommandOptions): void {
  const days = parsePeriodDays(options.period);
  const limit = options.limit ?? 50;

  const src = options.mcp ? 'mcp' as const : options.cli ? 'cli' as const : undefined;

  const entries = queryAuditLog({
    key,
    periodDays: days,
    writesOnly: options.writes,
    src,
    limit,
  });

  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log(color.gray('No audit entries found.'));
    return;
  }

  const periodLabel = options.period === 'all' ? 'all time' : `last ${options.period ?? '30d'}`;
  console.log(color.bold(`\nAudit Log \u2014 ${periodLabel}, ${entries.length} entries\n`));

  const termWidth = process.stdout.columns || 80;
  // Diff lines are indented to align under the tool column:
  // "Mon DD " (7) + "HH:MM" (5) + "  " (2) = 14 chars
  const DIFF_INDENT = 14;
  const diffMax = termWidth - DIFF_INDENT - 2; // "- " or "+ " prefix

  let lastDate = '';

  for (const entry of entries) {
    const { date, time } = formatTs(entry.ts);
    const hasDiff = entry.before !== undefined || entry.after !== undefined || entry.error;

    // Collapse repeated dates
    const dateCol = date === lastDate ? '      ' : color.white(date);
    lastDate = date;

    const timeCol = color.gray(time);
    const tool = shortTool(entry.tool);
    const keyStr = entry.key ? color.cyan(entry.key) : color.gray('(bulk)');
    const srcStr = color.gray(srcLabel(entry));
    const status = entry.success ? color.green('OK') : color.red('FAIL');
    const scope = entry.scope && entry.scope !== 'auto' ? `  ${color.gray('[' + entry.scope + ']')}` : '';

    console.log(`${dateCol} ${timeCol}  ${tool}  ${keyStr}  ${srcStr}  ${status}${scope}`);

    const pad = ' '.repeat(DIFF_INDENT);
    if (entry.before !== undefined) {
      console.log(`${pad}${color.red('- ' + truncate(entry.before, diffMax))}`);
    }
    if (entry.after !== undefined) {
      console.log(`${pad}${color.green('+ ' + truncate(entry.after, diffMax))}`);
    }
    if (entry.error) {
      console.log(`${pad}${color.red('error: ' + truncate(entry.error, diffMax))}`);
    }

    if (hasDiff) console.log('');
  }

  // Trailing newline if last entry didn't already add one via diff
  const last = entries[entries.length - 1];
  if (!(last.before !== undefined || last.after !== undefined || last.error)) {
    console.log('');
  }
}
