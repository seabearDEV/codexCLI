import path from 'path';
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
  project?: string;
  hits?: boolean;
  misses?: boolean;
  redundant?: boolean;
  detailed?: boolean;
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

function projectLabel(entry: AuditEntry): string {
  if (!entry.project) return '';
  return path.basename(entry.project);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}K`;
}

function metricsLine(entry: AuditEntry): string {
  const tags: string[] = [];
  if (entry.duration !== undefined) tags.push(`${entry.duration}ms`);
  if (entry.aliasResolved) tags.push(`alias\u2192${entry.aliasResolved}`);
  if (entry.responseSize !== undefined) tags.push(`res=${formatBytes(entry.responseSize)}`);
  if (entry.requestSize !== undefined) tags.push(`req=${formatBytes(entry.requestSize)}`);
  if (entry.hit !== undefined) tags.push(entry.hit ? 'hit' : 'miss');
  if (entry.tier !== undefined) tags.push(`tier=${entry.tier}`);
  if (entry.entryCount !== undefined) tags.push(`n=${entry.entryCount}`);
  if (entry.redundant) tags.push('redundant');
  return tags.length > 0 ? tags.join('  ') : '';
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
    project: options.project,
    hitsOnly: options.hits,
    missesOnly: options.misses,
    redundantOnly: options.redundant,
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

  // Show project column when entries span multiple projects
  const projectNames = new Set(entries.map(e => e.project ?? ''));
  const showProject = projectNames.size > 1 || (projectNames.size === 1 && !projectNames.has(''));

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
    const proj = showProject ? `  ${color.gray(projectLabel(entry) || 'global')}` : '';

    console.log(`${dateCol} ${timeCol}  ${tool}  ${keyStr}  ${srcStr}  ${status}${scope}${proj}`);

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
    const metrics = options.detailed ? metricsLine(entry) : '';
    if (metrics) {
      console.log(`${pad}${color.gray(metrics)}`);
    }

    if (hasDiff || metrics) console.log('');
  }

  // Trailing newline if last entry didn't already add one via diff/metrics
  const last = entries[entries.length - 1];
  const lastHasDetail = last.before !== undefined || last.after !== undefined || Boolean(last.error) || Boolean(options.detailed && metricsLine(last));
  if (!lastHasDetail) {
    console.log('');
  }
}
