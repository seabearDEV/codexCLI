import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadData } from './storage';
import { loadAliases } from './alias';
import { flattenObject } from './utils/objectPath';
import { debug } from './utils/debug';
import { VALID_DATA_TYPES } from './commands/helpers';
import { VALID_CONFIG_KEYS } from './config';

// --- Types ---

export interface CompletionItem {
  value: string;
  description: string;
  group: string;
}

// Terminal height detection — stderr stays connected to the tty even when
// stdout is piped (which it is during shell completion).
function getMaxCompletionItems(): number {
  const rows = process.stderr.rows || process.stdout.rows || 24;
  return Math.max(rows - 5, 5);
}

// Argument types for dynamic completion
type ArgType = 'dataKey' | 'dataKeyPrefix' | 'aliasName' | 'configKey' | 'exportType' | null;

interface CommandDef {
  flags: Record<string, string>;
  argType: ArgType;
  description?: string | undefined;
  subcommands?: Record<string, CommandDef>;
}

// --- Static data ---

const CONFIG_KEYS: readonly string[] = VALID_CONFIG_KEYS;
const EXPORT_TYPES: readonly string[] = VALID_DATA_TYPES;
const FORMAT_OPTIONS = ['json', 'yaml', 'text'];

const FLAG_DESCRIPTIONS: Record<string, string> = {
  '--tree': 'Display as tree',
  '-t': 'Display as tree',
  '--raw': 'Output raw values',
  '-r': 'Output raw values',
  '--format': 'Set output format',
  '--force': 'Skip confirmation',
  '-f': 'Skip confirmation',
  '--yes': 'Skip confirmation',
  '-y': 'Skip confirmation',
  '--dry': 'Print without executing',
  '--keys-only': 'Search only keys',
  '-k': 'Search only keys',
  '--values-only': 'Search only values',
  '-v': 'Search only values',
  '--entries-only': 'Search only data entries',
  '--aliases-only': 'Search only aliases',
  '-a': 'Search only aliases',
  '--output': 'Output file path',
  '-o': 'Output file path',
  '--encrypt': 'Encrypt the value',
  '-e': 'Encrypt the value',
  '--alias': 'Create an alias for this key',
  '--decrypt': 'Decrypt an encrypted value',
  '-d': 'Decrypt an encrypted value',
  '--copy': 'Copy value to clipboard',
  '-c': 'Copy value to clipboard',
  '--clear': 'Clear terminal after setting',
  '--source': 'Output for shell eval',
};

const GLOBAL_FLAGS: Record<string, string> = {
  '--debug': 'Enable debug output',
  '--version': 'Show version',
  '--help': 'Show help',
};

const CLI_TREE: Record<string, CommandDef> = {
  set: {
    flags: { '--force': FLAG_DESCRIPTIONS['--force'], '-f': FLAG_DESCRIPTIONS['-f'], '--encrypt': FLAG_DESCRIPTIONS['--encrypt'], '-e': FLAG_DESCRIPTIONS['-e'], '--alias': FLAG_DESCRIPTIONS['--alias'], '--clear': FLAG_DESCRIPTIONS['--clear'], '-c': FLAG_DESCRIPTIONS['--clear'] },
    argType: 'dataKeyPrefix',
    description: 'Set an entry',
  },
  s: {
    flags: { '--force': FLAG_DESCRIPTIONS['--force'], '-f': FLAG_DESCRIPTIONS['-f'], '--encrypt': FLAG_DESCRIPTIONS['--encrypt'], '-e': FLAG_DESCRIPTIONS['-e'], '--alias': FLAG_DESCRIPTIONS['--alias'], '--clear': FLAG_DESCRIPTIONS['--clear'], '-c': FLAG_DESCRIPTIONS['--clear'] },
    argType: 'dataKeyPrefix',
    description: 'Set an entry',
  },
  get: {
    flags: {
      '--tree': FLAG_DESCRIPTIONS['--tree'], '-t': FLAG_DESCRIPTIONS['-t'],
      '--raw': FLAG_DESCRIPTIONS['--raw'], '-r': FLAG_DESCRIPTIONS['-r'],
      '--keys-only': FLAG_DESCRIPTIONS['--keys-only'], '-k': FLAG_DESCRIPTIONS['-k'],
      '--decrypt': FLAG_DESCRIPTIONS['--decrypt'], '-d': FLAG_DESCRIPTIONS['-d'],
      '--copy': FLAG_DESCRIPTIONS['--copy'], '-c': FLAG_DESCRIPTIONS['-c'],
    },
    argType: 'dataKey',
    description: 'Retrieve entries',
  },
  g: {
    flags: {
      '--tree': FLAG_DESCRIPTIONS['--tree'], '-t': FLAG_DESCRIPTIONS['-t'],
      '--raw': FLAG_DESCRIPTIONS['--raw'], '-r': FLAG_DESCRIPTIONS['-r'],
      '--keys-only': FLAG_DESCRIPTIONS['--keys-only'], '-k': FLAG_DESCRIPTIONS['-k'],
      '--decrypt': FLAG_DESCRIPTIONS['--decrypt'], '-d': FLAG_DESCRIPTIONS['-d'],
      '--copy': FLAG_DESCRIPTIONS['--copy'], '-c': FLAG_DESCRIPTIONS['-c'],
    },
    argType: 'dataKey',
    description: 'Retrieve entries',
  },
  run: {
    flags: {
      '--yes': FLAG_DESCRIPTIONS['--yes'], '-y': FLAG_DESCRIPTIONS['-y'],
      '--dry': FLAG_DESCRIPTIONS['--dry'],
      '--decrypt': FLAG_DESCRIPTIONS['--decrypt'], '-d': FLAG_DESCRIPTIONS['-d'],
      '--source': FLAG_DESCRIPTIONS['--source'],
    },
    argType: 'dataKey',
    description: 'Execute a stored command',
  },
  r: {
    flags: {
      '--yes': FLAG_DESCRIPTIONS['--yes'], '-y': FLAG_DESCRIPTIONS['-y'],
      '--dry': FLAG_DESCRIPTIONS['--dry'],
      '--decrypt': FLAG_DESCRIPTIONS['--decrypt'], '-d': FLAG_DESCRIPTIONS['-d'],
      '--source': FLAG_DESCRIPTIONS['--source'],
    },
    argType: 'dataKey',
    description: 'Execute a stored command',
  },
  find: {
    flags: {
      '--keys-only': FLAG_DESCRIPTIONS['--keys-only'], '-k': FLAG_DESCRIPTIONS['-k'],
      '--values-only': FLAG_DESCRIPTIONS['--values-only'], '-v': FLAG_DESCRIPTIONS['-v'],
      '--entries-only': FLAG_DESCRIPTIONS['--entries-only'], '-e': FLAG_DESCRIPTIONS['--entries-only'],
      '--aliases-only': FLAG_DESCRIPTIONS['--aliases-only'], '-a': FLAG_DESCRIPTIONS['-a'],
      '--tree': FLAG_DESCRIPTIONS['--tree'], '-t': FLAG_DESCRIPTIONS['-t'],
    },
    argType: null,
    description: 'Find entries by key or value',
  },
  f: {
    flags: {
      '--keys-only': FLAG_DESCRIPTIONS['--keys-only'], '-k': FLAG_DESCRIPTIONS['-k'],
      '--values-only': FLAG_DESCRIPTIONS['--values-only'], '-v': FLAG_DESCRIPTIONS['-v'],
      '--entries-only': FLAG_DESCRIPTIONS['--entries-only'], '-e': FLAG_DESCRIPTIONS['--entries-only'],
      '--aliases-only': FLAG_DESCRIPTIONS['--aliases-only'], '-a': FLAG_DESCRIPTIONS['-a'],
      '--tree': FLAG_DESCRIPTIONS['--tree'], '-t': FLAG_DESCRIPTIONS['-t'],
    },
    argType: null,
    description: 'Find entries by key or value',
  },
  remove: {
    flags: {},
    argType: 'dataKey',
    description: 'Remove an entry',
  },
  rm: {
    flags: {},
    argType: 'dataKey',
    description: 'Remove an entry',
  },
  alias: {
    flags: {},
    argType: null,
    description: 'Manage aliases',
    subcommands: {
      set:    { flags: {}, argType: 'dataKey', description: 'Set an alias' },
      s:      { flags: {}, argType: 'dataKey', description: 'Set an alias' },
      remove: { flags: {}, argType: 'aliasName', description: 'Remove an alias' },
      rm:     { flags: {}, argType: 'aliasName', description: 'Remove an alias' },
      rename: { flags: {}, argType: 'aliasName', description: 'Rename an alias' },
      rn:     { flags: {}, argType: 'aliasName', description: 'Rename an alias' },
      get: {
        flags: {
          '--tree': FLAG_DESCRIPTIONS['--tree'], '-t': FLAG_DESCRIPTIONS['-t'],
        },
        argType: 'aliasName',
        description: 'List or get aliases',
      },
      g: {
        flags: {
          '--tree': FLAG_DESCRIPTIONS['--tree'], '-t': FLAG_DESCRIPTIONS['-t'],
        },
        argType: 'aliasName',
        description: 'List or get aliases',
      },
    },
  },
  config: {
    flags: {},
    argType: null,
    description: 'View or change settings',
    subcommands: {
      set: { flags: {}, argType: 'configKey', description: 'Set a config value' },
      get: { flags: {}, argType: 'configKey', description: 'Get config values' },
    },
  },
  info: {
    flags: {},
    argType: null,
    description: 'Show version, stats, and storage info',
  },
  i: {
    flags: {},
    argType: null,
    description: 'Show version, stats, and storage info',
  },
  init: {
    flags: { '--force': FLAG_DESCRIPTIONS['--force'], '-f': FLAG_DESCRIPTIONS['-f'] },
    argType: null,
    description: 'Initialize with example data',
  },
  examples: {
    flags: {},
    argType: null,
    description: 'Show usage examples',
  },
  ex: {
    flags: {},
    argType: null,
    description: 'Show usage examples',
  },
  export: {
    flags: {
      '--format': FLAG_DESCRIPTIONS['--format'],
      '--output': FLAG_DESCRIPTIONS['--output'], '-o': FLAG_DESCRIPTIONS['-o'],
    },
    argType: 'exportType',
    description: 'Export data or aliases',
  },
  import: {
    flags: { '--format': FLAG_DESCRIPTIONS['--format'] },
    argType: 'exportType',
    description: 'Import data or aliases',
  },
  reset: {
    flags: { '--force': FLAG_DESCRIPTIONS['--force'], '-f': FLAG_DESCRIPTIONS['-f'] },
    argType: 'exportType',
    description: 'Reset to empty state',
  },
  completions: {
    flags: {},
    argType: null,
    description: 'Manage shell completions',
    subcommands: {
      bash:    { flags: {}, argType: null, description: 'Output Bash script' },
      zsh:     { flags: {}, argType: null, description: 'Output Zsh script' },
      install: { flags: {}, argType: null, description: 'Auto-install completions' },
    },
  },
  migrate: {
    flags: {},
    argType: null,
    description: 'Migrate storage backend',
    subcommands: {
      sqlite: { flags: { '--force': FLAG_DESCRIPTIONS['--force'], '-f': FLAG_DESCRIPTIONS['-f'] }, argType: null, description: 'Migrate to SQLite' },
      json:   { flags: { '--force': FLAG_DESCRIPTIONS['--force'], '-f': FLAG_DESCRIPTIONS['-f'] }, argType: null, description: 'Migrate to JSON' },
    },
  },
};

// --- Dynamic data loaders ---

function getDataKeys(): string[] {
  try {
    const data = loadData();
    return Object.keys(flattenObject(data));
  } catch (error) {
    debug('Failed to load data keys for completion', { error: String(error) });
    return [];
  }
}

function getAliasNames(): string[] {
  try {
    return Object.keys(loadAliases());
  } catch (error) {
    debug('Failed to load alias names for completion', { error: String(error) });
    return [];
  }
}

function getDynamicValues(argType: ArgType): CompletionItem[] {
  switch (argType) {
    case 'dataKey':
    case 'dataKeyPrefix': {
      const keys = getDataKeys()        .map(k => ({ value: k, description: 'Data key', group: 'data keys' }));
      const aliases = getAliasNames()        .map(a => ({ value: a, description: 'Alias', group: 'aliases' }));
      return [...keys, ...aliases];
    }
    case 'aliasName':
      return getAliasNames()        .map(a => ({ value: a, description: 'Alias', group: 'aliases' }));
    case 'configKey':
      return CONFIG_KEYS.map(k => ({ value: k, description: 'Config setting', group: 'config' }));
    case 'exportType':
      return EXPORT_TYPES.map(t => ({ value: t, description: 'Export type', group: 'types' }));
    default:
      return [];
  }
}

/** Truncate completion values to the next dot-segment boundary after the typed partial. */
function truncateToNextDot(items: CompletionItem[], partial: string): CompletionItem[] {
  const seen = new Set<string>();
  const result: CompletionItem[] = [];

  for (const item of items) {
    const dotIndex = item.value.indexOf('.', partial.length);
    if (dotIndex === -1) {
      // No more dots — return the full value (leaf key or alias)
      if (!seen.has(item.value)) {
        seen.add(item.value);
        result.push(item);
      }
    } else {
      // Truncate to include the dot (namespace prefix)
      const prefix = item.value.substring(0, dotIndex + 1);
      if (!seen.has(prefix)) {
        seen.add(prefix);
        result.push({ value: prefix, description: 'Namespace', group: item.group });
      }
    }
  }

  return result;
}

// --- Core completion logic ---

export function getCompletions(compLine: string, compPoint: number): CompletionItem[] {
  const results = getCompletionsUnlimited(compLine, compPoint);
  const max = getMaxCompletionItems();
  return results.length > max ? results.slice(0, max) : results;
}

function getCompletionsUnlimited(compLine: string, compPoint: number): CompletionItem[] {
  // Slice line to cursor position
  const lineToPoint = compLine.slice(0, compPoint);

  // Split into words, preserving trailing space info
  const words = lineToPoint.split(/\s+/).filter(Boolean);
  const endsWithSpace = lineToPoint.endsWith(' ') || lineToPoint === '';
  const partial = endsWithSpace ? '' : (words.pop() || '');

  // words[0] is the program name (ccli); skip it
  const args = words.slice(1);

  // No command typed yet — complete top-level commands
  if (args.length === 0) {
    const topLevel = Object.entries(CLI_TREE).map(
      ([name, def]) => ({ value: name, description: def.description || '', group: 'commands' })
    );
    return filterPrefix(topLevel, partial);
  }

  const commandName = args[0];
  const cmdDef = CLI_TREE[commandName];

  // Unknown command — still suggest top-level commands
  if (!cmdDef) {
    const topLevel = Object.entries(CLI_TREE).map(
      ([name, def]) => ({ value: name, description: def.description || '', group: 'commands' })
    );
    return filterPrefix(topLevel, partial);
  }

  // Check for subcommand context
  let activeDef: CommandDef = cmdDef;

  if (cmdDef.subcommands && args.length > 1) {
    const subName = args[1];
    const subDef = cmdDef.subcommands[subName];
    if (subDef) {
      activeDef = subDef;
    } else if (!endsWithSpace && args.length === 2) {
      // Still typing subcommand name
      const subs = Object.entries(cmdDef.subcommands).map(
        ([name, def]) => ({ value: name, description: def.description || '', group: 'subcommands' })
      );
      return filterPrefix(subs, partial);
    }
  }

  // If the command has subcommands and we haven't matched one yet, suggest them
  if (cmdDef.subcommands && args.length === 1) {
    const subs = Object.entries(cmdDef.subcommands).map(
      ([name, def]) => ({ value: name, description: def.description || '', group: 'subcommands' })
    );
    if (endsWithSpace) {
      return subs;
    }
    return filterPrefix(subs, partial);
  }

  const prevWord = args[args.length - 1];

  // Special case: previous word is --format → suggest format options
  if (prevWord === '--format') {
    const fmtItems = FORMAT_OPTIONS.map(f => ({ value: f, description: 'Output format', group: 'formats' }));
    if (endsWithSpace) {
      return fmtItems;
    }
    return filterPrefix(fmtItems, partial);
  }

  // Special case: previous word is --output → let shell handle file completion
  if (prevWord === '--output' || prevWord === '-o') {
    return [];
  }

  // Build candidates: flags only when typing a dash, data keys otherwise
  const candidates: CompletionItem[] = [];
  const typingFlag = partial.startsWith('-');

  if (typingFlag) {
    // Add flags that haven't been used yet
    const usedFlags = new Set(args.filter(a => a.startsWith('-')));
    for (const [flag, desc] of Object.entries(activeDef.flags)) {
      if (!usedFlags.has(flag)) {
        candidates.push({ value: flag, description: desc, group: 'flags' });
      }
    }
    for (const [flag, desc] of Object.entries(GLOBAL_FLAGS)) {
      if (!usedFlags.has(flag)) {
        candidates.push({ value: flag, description: desc, group: 'flags' });
      }
    }
  } else {
    // Add dynamic argument values
    if (activeDef.argType) {
      candidates.push(...getDynamicValues(activeDef.argType));
    }
  }

  const filtered = filterPrefix(candidates, partial);

  // For dataKeyPrefix, truncate to next dot-segment so set completes one level at a time
  if (activeDef.argType === 'dataKeyPrefix' && !typingFlag) {
    return truncateToNextDot(filtered, partial);
  }

  return filtered;
}

function filterPrefix(items: CompletionItem[], prefix: string): CompletionItem[] {
  if (!prefix) return items;
  return items.filter(item => item.value.startsWith(prefix));
}

// --- Shell script generators ---

export function generateBashScript(): string {
  return `# Bash completion for ccli (CodexCLI)
_ccli_completions() {
  local completions
  completions="$(ccli --get-completions "$COMP_LINE" "$COMP_POINT" 2>/dev/null)"
  if [ -z "$completions" ]; then
    return
  fi
  local tab=$'\\t'
  COMPREPLY=()
  while IFS= read -r line; do
    local value="\${line%%\${tab}*}"
    COMPREPLY+=("$value")
  done <<< "$completions"
  # Suppress trailing space for namespace prefixes (values ending in .)
  local all_dot=1
  for reply in "\${COMPREPLY[@]}"; do
    if [[ "$reply" != *. ]]; then
      all_dot=0
      break
    fi
  done
  if [[ $all_dot -eq 1 && \${#COMPREPLY[@]} -gt 0 ]]; then
    compopt -o nospace
  fi
}
complete -o default -F _ccli_completions ccli
`;
}

export function generateZshScript(): string {
  return `# Zsh completion for ccli (CodexCLI)
_ccli_completions() {
  local line tab=$'\\t'
  local -A groups
  while IFS= read -r line; do
    if [[ -z "$line" ]]; then
      continue
    fi
    if [[ "$line" == *\${tab}* ]]; then
      local value="\${line%%\${tab}*}"
      local rest="\${line#*\${tab}}"
      local desc="\${rest%%\${tab}*}"
      local grp="\${rest#*\${tab}}"
      if [[ "$grp" == "$desc" ]]; then
        grp="completions"
      fi
      groups[\${grp}]="\${groups[\${grp}]+\${groups[\${grp}]}|}\${value}:\${desc}"
    else
      groups[completions]="\${groups[completions]+\${groups[completions]}|}\${line}"
    fi
  done < <(ccli --get-completions "$BUFFER" "$CURSOR" 2>/dev/null)
  if (( \${#groups} == 0 )); then
    _files
    return
  fi
  local grp_name _ccli_val
  local -a _ccli_items _ccli_dot _ccli_norm
  for grp_name in \${(ko)groups}; do
    _ccli_items=("\${(@s:|:)groups[\$grp_name]}")
    _ccli_dot=()
    _ccli_norm=()
    for _ccli_val in "\${_ccli_items[@]}"; do
      if [[ "\${_ccli_val%%:*}" == *. ]]; then
        _ccli_dot+=("\${_ccli_val%%:*}")
      else
        _ccli_norm+=("\$_ccli_val")
      fi
    done
    (( \${#_ccli_norm} )) && _describe "\$grp_name" _ccli_norm
    (( \${#_ccli_dot} )) && compadd -S '' -- "\${_ccli_dot[@]}"
  done
}
compdef _ccli_completions ccli
`;
}

// --- Install helper ---

export function installCompletions(): void {
  const shell = process.env.SHELL || '';
  let rcFile: string;
  let scriptCmd: string;

  const home = os.homedir();
  if (shell.endsWith('/zsh')) {
    rcFile = path.join(home, '.zshrc');
    scriptCmd = 'eval "$(ccli completions zsh)"';
  } else if (shell.endsWith('/bash')) {
    // Prefer .bash_profile on macOS, .bashrc on Linux
    const bashProfile = path.join(home, '.bash_profile');
    const bashrc = path.join(home, '.bashrc');
    rcFile = process.platform === 'darwin' && fs.existsSync(bashProfile) ? bashProfile : bashrc;
    scriptCmd = 'eval "$(ccli completions bash)"';
  } else {
    console.error(`Unsupported shell: ${shell || '(unknown)'}`);
    console.error('Supported shells: bash, zsh');
    console.error('You can manually add completions by running: ccli completions bash  OR  ccli completions zsh');
    process.exit(1);
  }

  const content = fs.existsSync(rcFile) ? fs.readFileSync(rcFile, 'utf8') : '';

  // Install completions
  if (content.includes('ccli completions')) {
    console.log(`Completions already installed in ${rcFile}`);
  } else {
    const completionBlock = `\n# CodexCLI shell completions\n${scriptCmd}\n`;
    fs.appendFileSync(rcFile, completionBlock, 'utf8');
    console.log(`Completions installed in ${rcFile}`);
  }

  // Install shell wrapper for `ccli run` / `ccli r` (eval in current shell)
  // Re-read content since completions block may have been appended above
  let wrapperContent = fs.existsSync(rcFile) ? fs.readFileSync(rcFile, 'utf8') : '';

  if (wrapperContent.includes('# CodexCLI shell wrapper')) {
    console.log(`Shell wrapper already installed in ${rcFile}`);
  } else {
    const wrapperBlock = `
# CodexCLI shell wrapper — eval "ccli run" in the current shell so cd/export/alias work
ccli() {
  local subcmd=""
  for arg in "$@"; do
    [[ "$arg" == -* ]] && continue
    subcmd="$arg"
    break
  done
  if [[ "$subcmd" == "run" || "$subcmd" == "r" ]]; then
    local __ccli_cmd __ccli_exit
    __ccli_cmd="$(command ccli "$@" --source)"
    __ccli_exit=$?
    [[ $__ccli_exit -ne 0 ]] && return $__ccli_exit
    [[ -n "$__ccli_cmd" ]] && eval "$__ccli_cmd"
  else
    command ccli "$@"
  fi
}
`;
    fs.appendFileSync(rcFile, wrapperBlock, 'utf8');
    console.log(`Shell wrapper installed in ${rcFile}`);
  }

  // Install history exclusion
  // Re-read content since earlier blocks may have been appended above
  let currentContent = fs.existsSync(rcFile) ? fs.readFileSync(rcFile, 'utf8') : '';

  if (currentContent.includes('_codexcli_history_filter') || (!shell.endsWith('/zsh') && currentContent.includes('HISTIGNORE'))) {
    console.log(`History exclusion already configured in ${rcFile}`);
  } else {
    // Migrate from old HISTORY_IGNORE approach if present (zsh only)
    if (shell.endsWith('/zsh') && currentContent.includes('HISTORY_IGNORE')) {
      currentContent = currentContent
        .replace(/\n?# CodexCLI - exclude from shell history\n/, '\n')
        .replace(/\n?HISTORY_IGNORE="\(ccli \*\)"\n?/, '\n');
      fs.writeFileSync(rcFile, currentContent, 'utf8');
      console.log('Migrated from old HISTORY_IGNORE to zshaddhistory hook');
    }

    const historyBlock = shell.endsWith('/zsh')
      ? `\n# CodexCLI - exclude from shell history (set/s commands may contain sensitive values)\n[[ -z \${functions[add-zsh-hook]} ]] && autoload -Uz add-zsh-hook\n_codexcli_history_filter() { [[ $1 != ccli\\ (set|s)\\ * ]] }\nadd-zsh-hook zshaddhistory _codexcli_history_filter\n`
      : `\n# CodexCLI - exclude from shell history (set/s commands may contain sensitive values)\nHISTIGNORE="\${HISTIGNORE:+\$HISTIGNORE:}ccli set *:ccli s *"\n`;
    fs.appendFileSync(rcFile, historyBlock, 'utf8');
    console.log(`History exclusion installed in ${rcFile}`);
  }

  console.log(`Restart your shell or run: source ${rcFile}`);
}
