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
type ArgType = 'dataKey' | 'aliasName' | 'configKey' | 'exportType' | null;

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
};

const GLOBAL_FLAGS: Record<string, string> = {
  '--debug': 'Enable debug output',
  '--version': 'Show version',
  '--help': 'Show help',
};

const CLI_TREE: Record<string, CommandDef> = {
  set: {
    flags: { '--force': FLAG_DESCRIPTIONS['--force'], '-f': FLAG_DESCRIPTIONS['-f'], '--encrypt': FLAG_DESCRIPTIONS['--encrypt'], '-e': FLAG_DESCRIPTIONS['-e'], '--alias': FLAG_DESCRIPTIONS['--alias'] },
    argType: 'dataKey',
    description: 'Set an entry',
  },
  s: {
    flags: { '--force': FLAG_DESCRIPTIONS['--force'], '-f': FLAG_DESCRIPTIONS['-f'], '--encrypt': FLAG_DESCRIPTIONS['--encrypt'], '-e': FLAG_DESCRIPTIONS['-e'], '--alias': FLAG_DESCRIPTIONS['--alias'] },
    argType: 'dataKey',
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
    },
    argType: 'dataKey',
    description: 'Execute a stored command',
  },
  r: {
    flags: {
      '--yes': FLAG_DESCRIPTIONS['--yes'], '-y': FLAG_DESCRIPTIONS['-y'],
      '--dry': FLAG_DESCRIPTIONS['--dry'],
      '--decrypt': FLAG_DESCRIPTIONS['--decrypt'], '-d': FLAG_DESCRIPTIONS['-d'],
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
    case 'dataKey': {
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

  return filterPrefix(candidates, partial);
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
  local grp_name
  for grp_name in \${(ko)groups}; do
    local -a items=("\${(@s:|:)groups[\$grp_name]}")
    _describe "\$grp_name" items
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

  // Check if already installed
  if (fs.existsSync(rcFile)) {
    const content = fs.readFileSync(rcFile, 'utf8');
    if (content.includes('ccli completions')) {
      console.log(`Completions already installed in ${rcFile}`);
      return;
    }
  }

  // Append to RC file
  const line = `\n# CodexCLI shell completions\n${scriptCmd}\n`;
  fs.appendFileSync(rcFile, line, 'utf8');
  console.log(`Completions installed in ${rcFile}`);
  console.log(`Restart your shell or run: source ${rcFile}`);
}
