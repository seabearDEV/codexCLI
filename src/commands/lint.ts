import { getEntriesFlat, Scope } from '../storage';
import { color } from '../formatting';
import { findProjectFile } from '../store';
import fs from 'fs';
import path from 'path';

const DEFAULT_NAMESPACES = ['project', 'commands', 'arch', 'conventions', 'context', 'files', 'deps', 'system'];

function loadCustomSchema(): string[] | null {
  const projectFile = findProjectFile();
  if (!projectFile) return null;
  try {
    // In v1.10.0, findProjectFile() returns a directory path when the new layout
    // is in use (.codexcli/ directory). Detect this by basename — the directory
    // has no extension, while the legacy file ends in .json.
    // The _schema feature is not implemented for the directory layout yet.
    if (path.basename(projectFile) === '.codexcli') return null;
    const raw = JSON.parse(fs.readFileSync(projectFile, 'utf8')) as Record<string, unknown>;
    const schema = raw._schema as { namespaces?: string[] } | undefined;
    return schema?.namespaces ?? null;
  } catch {
    return null;
  }
}

export interface LintResult {
  key: string;
  namespace: string;
  message: string;
}

export function lintEntries(options: { json?: boolean; global?: boolean } = {}): void {
  const scope: Scope | undefined = options.global ? 'global' : undefined;
  const flat = getEntriesFlat(scope);

  const customNamespaces = loadCustomSchema();
  const allowedNamespaces = customNamespaces
    ? [...new Set([...DEFAULT_NAMESPACES, ...customNamespaces])]
    : DEFAULT_NAMESPACES;

  const issues: LintResult[] = [];

  for (const key of Object.keys(flat)) {
    const ns = key.split('.')[0];
    if (!allowedNamespaces.includes(ns)) {
      issues.push({
        key,
        namespace: ns,
        message: `Namespace '${ns}' is not in the recommended schema`,
      });
    }
  }

  if (options.json) {
    console.log(JSON.stringify({ issues, allowed: allowedNamespaces }, null, 2));
    return;
  }

  if (issues.length === 0) {
    console.log(color.green('No schema issues found.'));
    console.log(color.gray(`Allowed namespaces: ${allowedNamespaces.join(', ')}`));
    return;
  }

  // Group by namespace
  const byNamespace = new Map<string, string[]>();
  for (const { key, namespace } of issues) {
    if (!byNamespace.has(namespace)) byNamespace.set(namespace, []);
    byNamespace.get(namespace)!.push(key);
  }

  console.log(color.bold(`\n${issues.length} entries outside recommended namespaces:\n`));
  for (const [ns, keys] of byNamespace) {
    console.log(`  ${color.yellow(ns)} (${keys.length} entries)`);
    for (const key of keys) {
      console.log(`    ${color.gray(key)}`);
    }
  }
  console.log(color.gray(`\nAllowed namespaces: ${allowedNamespaces.join(', ')}`));
  console.log(color.gray('Add custom namespaces via _schema.namespaces in .codexcli.json'));
  console.log('');
}
