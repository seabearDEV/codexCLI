import fs from 'fs';
import path from 'path';
import { loadData } from './storage';
import { loadAliases } from './alias';
import { flattenObject } from './utils/objectPath';

// --- Static data ---

const CONFIG_KEYS = ['colors', 'theme'];
const EXPORT_TYPES = ['data', 'aliases', 'all'];
const FORMAT_OPTIONS = ['json', 'yaml', 'text'];

// Argument types for dynamic completion
type ArgType = 'dataKey' | 'aliasName' | 'configKey' | 'exportType' | null;

interface CommandDef {
  flags: string[];
  argType: ArgType;
  subcommands?: Record<string, CommandDef>;
}

const CLI_TREE: Record<string, CommandDef> = {
  add:        { flags: [], argType: 'dataKey' },
  a:          { flags: [], argType: 'dataKey' },
  get:        { flags: ['--format', '--tree', '--raw'], argType: 'dataKey' },
  g:          { flags: ['--format', '--tree', '--raw'], argType: 'dataKey' },
  find:       { flags: ['--keys-only', '--values-only', '--tree'], argType: null },
  f:          { flags: ['--keys-only', '--values-only', '--tree'], argType: null },
  remove:     { flags: [], argType: 'dataKey' },
  rm:         { flags: [], argType: 'dataKey' },
  alias: {
    flags: [],
    argType: null,
    subcommands: {
      add:    { flags: [], argType: 'dataKey' },
      a:      { flags: [], argType: 'dataKey' },
      remove: { flags: [], argType: 'aliasName' },
      rm:     { flags: [], argType: 'aliasName' },
      get:    { flags: ['--tree', '--format'], argType: 'aliasName' },
      g:      { flags: ['--tree', '--format'], argType: 'aliasName' },
    },
  },
  config: {
    flags: [],
    argType: null,
    subcommands: {
      set: { flags: [], argType: 'configKey' },
      get: { flags: [], argType: 'configKey' },
    },
  },
  list:       { flags: ['--keys-only', '--format'], argType: null },
  examples:   { flags: ['--force'], argType: null },
  export:     { flags: ['--format', '--output'], argType: 'exportType' },
  import:     { flags: ['--format'], argType: 'exportType' },
  reset:      { flags: ['--force'], argType: 'exportType' },
  help:       { flags: [], argType: null },
  completions: {
    flags: [],
    argType: null,
    subcommands: {
      bash:    { flags: [], argType: null },
      zsh:     { flags: [], argType: null },
      install: { flags: [], argType: null },
    },
  },
};

const GLOBAL_FLAGS = ['--debug', '--version', '--help'];

// --- Dynamic data loaders ---

function getDataKeys(): string[] {
  try {
    const data = loadData();
    return Object.keys(flattenObject(data));
  } catch {
    return [];
  }
}

function getAliasNames(): string[] {
  try {
    return Object.keys(loadAliases());
  } catch {
    return [];
  }
}

function getDynamicValues(argType: ArgType): string[] {
  switch (argType) {
    case 'dataKey':
      return [...getDataKeys(), ...getAliasNames()];
    case 'aliasName':
      return getAliasNames();
    case 'configKey':
      return CONFIG_KEYS;
    case 'exportType':
      return EXPORT_TYPES;
    default:
      return [];
  }
}

// --- Core completion logic ---

export function getCompletions(compLine: string, compPoint: number): string[] {
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
    const topLevel = Object.keys(CLI_TREE);
    return filterPrefix(topLevel, partial);
  }

  const commandName = args[0];
  const cmdDef = CLI_TREE[commandName];

  // Unknown command — still suggest top-level commands
  if (!cmdDef) {
    const topLevel = Object.keys(CLI_TREE);
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
      return filterPrefix(Object.keys(cmdDef.subcommands), partial);
    }
  }

  // If the command has subcommands and we haven't matched one yet, suggest them
  if (cmdDef.subcommands && args.length === 1) {
    if (endsWithSpace) {
      return Object.keys(cmdDef.subcommands);
    }
    return filterPrefix(Object.keys(cmdDef.subcommands), partial);
  }

  const prevWord = args[args.length - 1];

  // Special case: previous word is --format → suggest format options
  if (prevWord === '--format' || prevWord === '-f') {
    if (endsWithSpace) {
      return FORMAT_OPTIONS;
    }
    return filterPrefix(FORMAT_OPTIONS, partial);
  }

  // Special case: previous word is --output → let shell handle file completion
  if (prevWord === '--output' || prevWord === '-o') {
    return [];
  }

  // Build candidates: flags + dynamic values
  const candidates: string[] = [];

  // Add flags that haven't been used yet
  const usedFlags = new Set(args.filter(a => a.startsWith('-')));
  for (const flag of [...activeDef.flags, ...GLOBAL_FLAGS]) {
    if (!usedFlags.has(flag)) {
      candidates.push(flag);
    }
  }

  // Add dynamic argument values
  if (activeDef.argType) {
    candidates.push(...getDynamicValues(activeDef.argType));
  }

  return filterPrefix(candidates, partial);
}

function filterPrefix(items: string[], prefix: string): string[] {
  if (!prefix) return items;
  return items.filter(item => item.startsWith(prefix));
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
  COMPREPLY=()
  while IFS= read -r line; do
    COMPREPLY+=("$line")
  done <<< "$completions"
}
complete -o default -F _ccli_completions ccli
`;
}

export function generateZshScript(): string {
  return `# Zsh completion for ccli (CodexCLI)
_ccli_completions() {
  local -a completions
  completions=("\${(@f)$(ccli --get-completions "$BUFFER" "$CURSOR" 2>/dev/null)}")
  if (( \${#completions} == 0 )) || [[ "\${completions[1]}" == "" ]]; then
    _files
    return
  fi
  compadd -a completions
}
compdef _ccli_completions ccli
`;
}

// --- Install helper ---

export function installCompletions(): void {
  const shell = process.env.SHELL || '';
  let rcFile: string;
  let scriptCmd: string;

  if (shell.endsWith('/zsh')) {
    rcFile = path.join(process.env.HOME || '~', '.zshrc');
    scriptCmd = 'eval "$(ccli completions zsh)"';
  } else if (shell.endsWith('/bash')) {
    // Prefer .bash_profile on macOS, .bashrc on Linux
    const bashProfile = path.join(process.env.HOME || '~', '.bash_profile');
    const bashrc = path.join(process.env.HOME || '~', '.bashrc');
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
