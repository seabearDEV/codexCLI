import { queryAuditLog } from '../utils/audit';
import { color } from '../formatting';

export interface AuditCommandOptions {
  period?: string;
  writes?: boolean;
  json?: boolean;
  limit?: number;
}

export function showAuditLog(key: string | undefined, options: AuditCommandOptions): void {
  const periodMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, 'all': 0 };
  const days = periodMap[options.period ?? '30d'] ?? 30;
  const limit = options.limit ?? 50;

  const entries = queryAuditLog({
    key,
    periodDays: days,
    writesOnly: options.writes,
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
  console.log(color.bold(`\nAudit Log (${periodLabel}, ${entries.length} entries)\n`));

  for (const entry of entries) {
    const time = new Date(entry.ts).toISOString().replace('T', ' ').slice(0, 19);
    const status = entry.success ? color.green('OK') : color.red('FAIL');
    const srcTag = entry.src === 'mcp' ? color.cyan('mcp') : color.white('cli');
    const keyStr = entry.key ? color.white(entry.key) : color.gray('(bulk)');
    const scopeStr = color.gray(`[${entry.scope ?? 'auto'}]`);
    const agentStr = entry.agent ? `  ${color.gray('agent=' + entry.agent)}` : '';

    console.log(`  ${color.gray(time)}  ${srcTag}  ${entry.tool.padEnd(20)}  ${keyStr}  ${scopeStr}  ${status}${agentStr}`);

    if (entry.before !== undefined) {
      console.log(`    ${color.red('- ' + entry.before)}`);
    }
    if (entry.after !== undefined) {
      console.log(`    ${color.green('+ ' + entry.after)}`);
    }
    if (entry.error) {
      console.log(`    ${color.red('error: ' + entry.error)}`);
    }
  }
  console.log('');
}
