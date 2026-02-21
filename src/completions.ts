import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadData } from './storage';
import { loadAliases } from './alias';
import { flattenObject } from './utils/objectPath';
import { debug } from './utils/debug';
import { VALID_DATA_TYPES } from './commands/helpers';
import { VALID_CONFIG_KEYS } from './config';
import { getBinaryName } from './utils/binaryName';

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
type ArgType = 'dataKey' | 'dataKeyOnly' | 'dataKeyPrefix' | 'configKey' | 'exportType' | null;

interface CommandDef {
  flags: Record<string, string>;
  argType: ArgType;
  description?: string | undefined;
  subcommands?: Record<string, CommandDef>;
}

// --- Static data ---

const CONFIG_KEYS: readonly string[] = VALID_CONFIG_KEYS;
const EXPORT_TYPES: readonly string[] = VALID_DATA_TYPES;

const FLAG_DESCRIPTIONS: Record<string, string> = {
  '--tree': 'Display as tree',
  '-t': 'Display as tree',
  '--raw': 'Output raw values',
  '-r': 'Output raw values',
  '-s': 'Show before interpolation',
  '--force': 'Skip confirmation',
  '-f': 'Skip confirmation',
  '--yes': 'Skip confirmation',
  '-y': 'Skip confirmation',
  '--dry': 'Print without executing',
  '--entries': 'Show entries only',
  '--aliases': 'Show aliases only',
  '--output': 'Output file path',
  '-o': 'Output file path',
  '--encrypt': 'Encrypt the value',
  '--alias': 'Create an alias for this key',
  '--decrypt': 'Decrypt an encrypted value',
  '-d': 'Decrypt an encrypted value',
  '--copy': 'Copy value to clipboard',
  '-c': 'Copy value to clipboard',
  '--clear': 'Clear terminal after setting',
  '--source': 'Show source/raw output',
  '--confirm': 'Require confirmation to run',
  '--no-confirm': 'Remove confirmation requirement',
  '--json': 'Output as JSON',
  '-j': 'Output as JSON',
};

const GLOBAL_FLAGS: Record<string, string> = {
  '--debug': 'Enable debug output',
  '--version': 'Show version',
  '--help': 'Show help',
};

const CLI_TREE: Record<string, CommandDef> = {
  set: {
    flags: { '--force': FLAG_DESCRIPTIONS['--force'], '-f': FLAG_DESCRIPTIONS['-f'], '--encrypt': FLAG_DESCRIPTIONS['--encrypt'], '-e': FLAG_DESCRIPTIONS['-e'], '--alias': FLAG_DESCRIPTIONS['--alias'], '--clear': FLAG_DESCRIPTIONS['--clear'], '-c': FLAG_DESCRIPTIONS['--clear'], '--confirm': FLAG_DESCRIPTIONS['--confirm'], '--no-confirm': FLAG_DESCRIPTIONS['--no-confirm'] },
    argType: 'dataKeyPrefix',
    description: 'Set an entry',
  },
  s: {
    flags: { '--force': FLAG_DESCRIPTIONS['--force'], '-f': FLAG_DESCRIPTIONS['-f'], '--encrypt': FLAG_DESCRIPTIONS['--encrypt'], '-e': FLAG_DESCRIPTIONS['-e'], '--alias': FLAG_DESCRIPTIONS['--alias'], '--clear': FLAG_DESCRIPTIONS['--clear'], '-c': FLAG_DESCRIPTIONS['--clear'], '--confirm': FLAG_DESCRIPTIONS['--confirm'], '--no-confirm': FLAG_DESCRIPTIONS['--no-confirm'] },
    argType: 'dataKeyPrefix',
    description: 'Set an entry',
  },
  get: {
    flags: {
      '--tree': FLAG_DESCRIPTIONS['--tree'], '-t': FLAG_DESCRIPTIONS['-t'],
      '--raw': FLAG_DESCRIPTIONS['--raw'], '-r': FLAG_DESCRIPTIONS['-r'],
      '--source': FLAG_DESCRIPTIONS['--source'], '-s': FLAG_DESCRIPTIONS['-s'],
      '--decrypt': FLAG_DESCRIPTIONS['--decrypt'], '-d': FLAG_DESCRIPTIONS['-d'],
      '--copy': FLAG_DESCRIPTIONS['--copy'], '-c': FLAG_DESCRIPTIONS['-c'],
      '--aliases': FLAG_DESCRIPTIONS['--aliases'], '-a': FLAG_DESCRIPTIONS['--aliases'],
      '--json': FLAG_DESCRIPTIONS['--json'], '-j': FLAG_DESCRIPTIONS['-j'],
    },
    argType: 'dataKey',
    description: 'Retrieve entries',
  },
  g: {
    flags: {
      '--tree': FLAG_DESCRIPTIONS['--tree'], '-t': FLAG_DESCRIPTIONS['-t'],
      '--raw': FLAG_DESCRIPTIONS['--raw'], '-r': FLAG_DESCRIPTIONS['-r'],
      '--source': FLAG_DESCRIPTIONS['--source'], '-s': FLAG_DESCRIPTIONS['-s'],
      '--decrypt': FLAG_DESCRIPTIONS['--decrypt'], '-d': FLAG_DESCRIPTIONS['-d'],
      '--copy': FLAG_DESCRIPTIONS['--copy'], '-c': FLAG_DESCRIPTIONS['-c'],
      '--aliases': FLAG_DESCRIPTIONS['--aliases'], '-a': FLAG_DESCRIPTIONS['--aliases'],
      '--json': FLAG_DESCRIPTIONS['--json'], '-j': FLAG_DESCRIPTIONS['-j'],
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
      '--entries': FLAG_DESCRIPTIONS['--entries'], '-e': FLAG_DESCRIPTIONS['--entries'],
      '--aliases': FLAG_DESCRIPTIONS['--aliases'], '-a': FLAG_DESCRIPTIONS['--aliases'],
      '--tree': FLAG_DESCRIPTIONS['--tree'], '-t': FLAG_DESCRIPTIONS['-t'],
      '--json': FLAG_DESCRIPTIONS['--json'], '-j': FLAG_DESCRIPTIONS['-j'],
    },
    argType: null,
    description: 'Find entries by key or value',
  },
  f: {
    flags: {
      '--entries': FLAG_DESCRIPTIONS['--entries'], '-e': FLAG_DESCRIPTIONS['--entries'],
      '--aliases': FLAG_DESCRIPTIONS['--aliases'], '-a': FLAG_DESCRIPTIONS['--aliases'],
      '--tree': FLAG_DESCRIPTIONS['--tree'], '-t': FLAG_DESCRIPTIONS['-t'],
      '--json': FLAG_DESCRIPTIONS['--json'], '-j': FLAG_DESCRIPTIONS['-j'],
    },
    argType: null,
    description: 'Find entries by key or value',
  },
  edit: {
    flags: { '--decrypt': FLAG_DESCRIPTIONS['--decrypt'], '-d': FLAG_DESCRIPTIONS['-d'] },
    argType: 'dataKey',
    description: 'Edit entry in $EDITOR',
  },
  e: {
    flags: { '--decrypt': FLAG_DESCRIPTIONS['--decrypt'], '-d': FLAG_DESCRIPTIONS['-d'] },
    argType: 'dataKey',
    description: 'Edit entry in $EDITOR',
  },
  rename: {
    flags: { '--alias': FLAG_DESCRIPTIONS['--alias'], '-a': 'Rename alias', '--set-alias': 'Set alias on renamed key' },
    argType: 'dataKey',
    description: 'Rename an entry key or alias',
  },
  rn: {
    flags: { '--alias': FLAG_DESCRIPTIONS['--alias'], '-a': 'Rename alias', '--set-alias': 'Set alias on renamed key' },
    argType: 'dataKey',
    description: 'Rename an entry key or alias',
  },
  remove: {
    flags: { '--force': FLAG_DESCRIPTIONS['--force'], '-f': FLAG_DESCRIPTIONS['-f'], '--alias': FLAG_DESCRIPTIONS['--alias'], '-a': 'Remove alias only' },
    argType: 'dataKey',
    description: 'Remove an entry',
  },
  rm: {
    flags: { '--force': FLAG_DESCRIPTIONS['--force'], '-f': FLAG_DESCRIPTIONS['-f'], '--alias': FLAG_DESCRIPTIONS['--alias'], '-a': 'Remove alias only' },
    argType: 'dataKey',
    description: 'Remove an entry',
  },
  config: {
    flags: {},
    argType: null,
    description: 'View or change settings',
    subcommands: {
      set: { flags: {}, argType: 'configKey', description: 'Set a config value' },
      get: { flags: {}, argType: 'configKey', description: 'Get config values' },
      info: { flags: {}, argType: null, description: 'Show version and stats' },
      examples: { flags: {}, argType: null, description: 'Show usage examples' },
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
    },
  },
  data: {
    flags: {},
    argType: null,
    description: 'Manage stored data',
    subcommands: {
      export: {
        flags: {
          '--output': FLAG_DESCRIPTIONS['--output'], '-o': FLAG_DESCRIPTIONS['-o'],
          '--pretty': 'Pretty-print output',
        },
        argType: 'exportType',
        description: 'Export data or aliases',
      },
      import: {
        flags: {
          '--merge': 'Merge with existing',
          '-m': 'Merge with existing',
          '--force': FLAG_DESCRIPTIONS['--force'], '-f': FLAG_DESCRIPTIONS['-f'],
        },
        argType: 'exportType',
        description: 'Import data or aliases',
      },
      reset: {
        flags: { '--force': FLAG_DESCRIPTIONS['--force'], '-f': FLAG_DESCRIPTIONS['-f'] },
        argType: 'exportType',
        description: 'Reset to empty state',
      },
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
      const keys = getDataKeys()        .map(k => ({ value: k, description: 'Entry', group: 'data keys' }));
      const aliases = getAliasNames()        .map(a => ({ value: a, description: 'Alias', group: 'aliases' }));
      return [...keys, ...aliases];
    }
    case 'dataKeyOnly':
      return getDataKeys()        .map(k => ({ value: k, description: '', group: 'data keys' }));
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
  const partial = endsWithSpace ? '' : (words.pop() ?? '');

  // words[0] is the program name (ccli); skip it
  const args = words.slice(1);

  // No command typed yet — complete top-level commands
  if (args.length === 0) {
    const topLevel = Object.entries(CLI_TREE).map(
      ([name, def]) => ({ value: name, description: def.description ?? '', group: 'commands' })
    );
    return filterPrefix(topLevel, partial);
  }

  const commandName = args[0];
  const cmdDef = CLI_TREE[commandName];

  // Unknown command — still suggest top-level commands
  if (!cmdDef) {
    const topLevel = Object.entries(CLI_TREE).map(
      ([name, def]) => ({ value: name, description: def.description ?? '', group: 'commands' })
    );
    return filterPrefix(topLevel, partial);
  }

  // Walk subcommand tree (supports arbitrary nesting: config -> completions -> bash)
  let activeDef: CommandDef = cmdDef;
  let depth = 1; // args[0] is the top-level command; walk from args[1] onward

  while (activeDef.subcommands && depth < args.length) {
    const subName = args[depth];
    const subDef = activeDef.subcommands[subName];
    if (subDef) {
      activeDef = subDef;
      depth++;
    } else if (!endsWithSpace && depth === args.length - 1) {
      // Still typing a subcommand name at this level
      const subs = Object.entries(activeDef.subcommands).map(
        ([name, def]) => ({ value: name, description: def.description ?? '', group: 'subcommands' })
      );
      return filterPrefix(subs, partial);
    } else {
      break;
    }
  }

  // If the active command has subcommands and we haven't descended further, suggest them
  if (activeDef.subcommands && depth === args.length) {
    const subs = Object.entries(activeDef.subcommands).map(
      ([name, def]) => ({ value: name, description: def.description ?? '', group: 'subcommands' })
    );
    if (endsWithSpace) {
      return subs;
    }
    return filterPrefix(subs, partial);
  }

  const prevWord = args[args.length - 1];

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
  const bin = getBinaryName();
  return `# Bash completion for ${bin} (CodexCLI)
_${bin}_completions() {
  local completions
  completions="$(${bin} --get-completions "$COMP_LINE" "$COMP_POINT" 2>/dev/null)"
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
complete -o default -F _${bin}_completions ${bin}
`;
}

export function generateZshScript(): string {
  const bin = getBinaryName();
  return `# Zsh completion for ${bin} (CodexCLI)
_${bin}_completions() {
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
  done < <(${bin} --get-completions "$BUFFER" "$CURSOR" 2>/dev/null)
  if (( \${#groups} == 0 )); then
    _files
    return
  fi
  local grp_name _${bin}_val
  local -a _${bin}_items _${bin}_dot _${bin}_desc _${bin}_plain
  for grp_name in \${(ko)groups}; do
    _${bin}_items=("\${(@s:|:)groups[\$grp_name]}")
    _${bin}_dot=()
    _${bin}_desc=()
    _${bin}_plain=()
    for _${bin}_val in "\${_${bin}_items[@]}"; do
      local _${bin}_key="\${_${bin}_val%%:*}"
      local _${bin}_dsc="\${_${bin}_val#*:}"
      if [[ "\$_${bin}_key" == *. ]]; then
        _${bin}_dot+=("\$_${bin}_key")
      elif [[ -n "\$_${bin}_dsc" ]]; then
        _${bin}_desc+=("\$_${bin}_val")
      else
        _${bin}_plain+=("\$_${bin}_key")
      fi
    done
    (( \${#_${bin}_desc} )) && _describe "\$grp_name" _${bin}_desc
    (( \${#_${bin}_plain} )) && compadd -- "\${_${bin}_plain[@]}"
    (( \${#_${bin}_dot} )) && compadd -S '' -- "\${_${bin}_dot[@]}"
  done
}
compdef _${bin}_completions ${bin}
`;
}

// --- Install helper ---

export function installCompletions(): void {
  const bin = getBinaryName();
  const shell = process.env.SHELL ?? '';
  let rcFile: string;
  let scriptCmd: string;

  const home = os.homedir();
  if (shell.endsWith('/zsh')) {
    rcFile = path.join(home, '.zshrc');
    scriptCmd = `eval "$(${bin} config completions zsh)"`;
  } else if (shell.endsWith('/bash')) {
    // Prefer .bash_profile on macOS, .bashrc on Linux
    const bashProfile = path.join(home, '.bash_profile');
    const bashrc = path.join(home, '.bashrc');
    rcFile = process.platform === 'darwin' && fs.existsSync(bashProfile) ? bashProfile : bashrc;
    scriptCmd = `eval "$(${bin} config completions bash)"`;
  } else {
    console.error(`Unsupported shell: ${shell || '(unknown)'}`);
    console.error('Supported shells: bash, zsh');
    console.error(`You can manually add completions by running: ${bin} config completions bash  OR  ${bin} config completions zsh`);
    process.exit(1);
  }

  const content = fs.existsSync(rcFile) ? fs.readFileSync(rcFile, 'utf8') : '';

  // Install completions
  if (content.includes(`${bin} completions`) || content.includes(`${bin} config completions`)) {
    console.log(`Completions already installed in ${rcFile}`);
  } else {
    const completionBlock = `\n# CodexCLI shell completions (${bin})\n${scriptCmd}\n`;
    fs.appendFileSync(rcFile, completionBlock, 'utf8');
    console.log(`Completions installed in ${rcFile}`);
  }

  // Install shell wrapper for `run` / `r` (eval in current shell)
  // Re-read content since completions block may have been appended above
  const wrapperContent = fs.existsSync(rcFile) ? fs.readFileSync(rcFile, 'utf8') : '';
  const wrapperMarker = `# CodexCLI shell wrapper (${bin})`;

  if (wrapperContent.includes(wrapperMarker)) {
    console.log(`Shell wrapper already installed in ${rcFile}`);
  } else {
    const wrapperBlock = `
${wrapperMarker} — eval "${bin} run" in the current shell so cd/export/alias work
${bin}() {
  local subcmd="" has_help=false
  for arg in "$@"; do
    if [[ "$arg" == "-h" || "$arg" == "--help" ]]; then
      has_help=true
    elif [[ "$arg" != -* && -z "$subcmd" ]]; then
      subcmd="$arg"
    fi
  done
  if [[ "$has_help" == false && ("$subcmd" == "run" || "$subcmd" == "r") ]]; then
    local __${bin}_cmd __${bin}_exit
    __${bin}_cmd="$(command ${bin} "$@" --source)"
    __${bin}_exit=$?
    [[ $__${bin}_exit -ne 0 ]] && return $__${bin}_exit
    [[ -n "$__${bin}_cmd" ]] && eval "$__${bin}_cmd"
  else
    command ${bin} "$@"
  fi
}
`;
    fs.appendFileSync(rcFile, wrapperBlock, 'utf8');
    console.log(`Shell wrapper installed in ${rcFile}`);
  }

  // Install history exclusion
  // Re-read content since earlier blocks may have been appended above
  let currentContent = fs.existsSync(rcFile) ? fs.readFileSync(rcFile, 'utf8') : '';
  const historyMarker = `_${bin}_history_filter`;

  if (currentContent.includes(historyMarker) || (!shell.endsWith('/zsh') && currentContent.includes('HISTIGNORE'))) {
    console.log(`History exclusion already configured in ${rcFile}`);
  } else {
    // Migrate from old HISTORY_IGNORE approach if present (zsh only, production ccli only)
    if (bin === 'ccli' && shell.endsWith('/zsh') && currentContent.includes('HISTORY_IGNORE')) {
      currentContent = currentContent
        .replace(/\n?# CodexCLI - exclude from shell history\n/, '\n')
        .replace(/\n?HISTORY_IGNORE="\(ccli \*\)"\n?/, '\n');
      fs.writeFileSync(rcFile, currentContent, 'utf8');
      console.log('Migrated from old HISTORY_IGNORE to zshaddhistory hook');
    }

    const historyBlock = shell.endsWith('/zsh')
      ? `\n# CodexCLI - exclude from shell history (${bin} set/s commands may contain sensitive values)\n[[ -z \${functions[add-zsh-hook]} ]] && autoload -Uz add-zsh-hook\n${historyMarker}() { [[ $1 != ${bin}\\ (set|s)\\ * ]] }\nadd-zsh-hook zshaddhistory ${historyMarker}\n`
      : `\n# CodexCLI - exclude from shell history (${bin} set/s commands may contain sensitive values)\nHISTIGNORE="\${HISTIGNORE:+\$HISTIGNORE:}${bin} set *:${bin} s *"\n`;
    fs.appendFileSync(rcFile, historyBlock, 'utf8');
    console.log(`History exclusion installed in ${rcFile}`);
  }

  console.log(`Restart your shell or run: source ${rcFile}`);
}
