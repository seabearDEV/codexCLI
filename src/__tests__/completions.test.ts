import * as fs from 'fs';
import { getCompletions, generateBashScript, generateZshScript, installCompletions, CompletionItem } from '../completions';
import { clearDataCache } from '../storage';
import { clearAliasCache } from '../alias';
import { clearConfigCache } from '../config';

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue(JSON.stringify({})),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  appendFileSync: jest.fn(),
  statSync: jest.fn().mockReturnValue({ mtimeMs: 1000 }),
}));

/** Extract just the .value strings from CompletionItem[] for simpler assertions */
function values(items: CompletionItem[]): string[] {
  return items.map(i => i.value);
}

/** Find a CompletionItem by value */
function findItem(items: CompletionItem[], value: string): CompletionItem | undefined {
  return items.find(i => i.value === value);
}

describe('Completions', () => {
  beforeEach(() => {
    clearDataCache();
    clearAliasCache();
    clearConfigCache();
  });

  describe('getCompletions', () => {
    it('returns top-level commands when no command typed', () => {
      const results = getCompletions('ccli ', 5);
      const v = values(results);
      expect(v).toContain('set');
      expect(v).toContain('get');
      expect(v).toContain('run');
      expect(v).toContain('find');
      expect(v).toContain('remove');
      expect(v).toContain('alias');
      expect(v).toContain('config');
    });

    it('returns CompletionItem objects with descriptions and groups', () => {
      const results = getCompletions('ccli ', 5);
      const setItem = findItem(results, 'set');
      expect(setItem).toBeDefined();
      expect(setItem!.description).toBe('Set an entry');
      expect(setItem!.group).toBe('commands');

      const getItem = findItem(results, 'get');
      expect(getItem).toBeDefined();
      expect(getItem!.description).toBe('Retrieve entries');
      expect(getItem!.group).toBe('commands');
    });

    it('filters top-level commands by partial input', () => {
      const results = getCompletions('ccli se', 7);
      const v = values(results);
      expect(v).toContain('set');
      expect(v).not.toContain('get');
    });

    it('returns flags for get command when typing a dash', () => {
      const results = getCompletions('ccli get -', 10);
      const v = values(results);
      expect(v).toContain('--tree');
      expect(v).toContain('--raw');
      expect(v).not.toContain('--format');
    });

    it('does not return flags for get command without a dash', () => {
      const results = getCompletions('ccli get ', 9);
      const v = values(results);
      expect(v).not.toContain('--tree');
      expect(v).not.toContain('--raw');
    });

    it('returns flags with descriptions and group', () => {
      const results = getCompletions('ccli get -', 10);
      const treeItem = findItem(results, '--tree');
      expect(treeItem).toBeDefined();
      expect(treeItem!.description).toBe('Display as tree');
      expect(treeItem!.group).toBe('flags');

      const rawItem = findItem(results, '--raw');
      expect(rawItem).toBeDefined();
      expect(rawItem!.description).toBe('Output raw values');
      expect(rawItem!.group).toBe('flags');
    });

    it('returns flags for run command when typing a dash', () => {
      const results = getCompletions('ccli run -', 10);
      const v = values(results);
      expect(v).toContain('--yes');
      expect(v).toContain('--dry');
    });

    it('returns flags for r shortcut when typing a dash', () => {
      const results = getCompletions('ccli r -', 8);
      const v = values(results);
      expect(v).toContain('--yes');
      expect(v).toContain('--dry');
    });

    it('returns --encrypt flag for set command when typing a dash', () => {
      const results = getCompletions('ccli set -', 10);
      const v = values(results);
      expect(v).toContain('--encrypt');
    });

    it('returns --encrypt flag for s shortcut when typing a dash', () => {
      const results = getCompletions('ccli s -', 8);
      const v = values(results);
      expect(v).toContain('--encrypt');
    });

    it('returns --decrypt flag for get command when typing a dash', () => {
      const results = getCompletions('ccli get -', 10);
      const v = values(results);
      expect(v).toContain('--decrypt');
    });

    it('returns --decrypt flag for g shortcut when typing a dash', () => {
      const results = getCompletions('ccli g -', 8);
      const v = values(results);
      expect(v).toContain('--decrypt');
    });

    it('returns --decrypt flag for run command when typing a dash', () => {
      const results = getCompletions('ccli run -', 10);
      const v = values(results);
      expect(v).toContain('--decrypt');
    });

    it('returns --decrypt flag for r shortcut when typing a dash', () => {
      const results = getCompletions('ccli r -', 8);
      const v = values(results);
      expect(v).toContain('--decrypt');
    });

    it('returns subcommands for alias', () => {
      const results = getCompletions('ccli alias ', 11);
      const v = values(results);
      expect(v).toContain('set');
      expect(v).toContain('remove');
      expect(v).toContain('get');
    });

    it('returns subcommands with descriptions and group', () => {
      const results = getCompletions('ccli alias ', 11);
      const setItem = findItem(results, 'set');
      expect(setItem).toBeDefined();
      expect(setItem!.description).toBe('Set an alias');
      expect(setItem!.group).toBe('subcommands');
    });

    it('returns subcommands for config', () => {
      const results = getCompletions('ccli config ', 12);
      const v = values(results);
      expect(v).toContain('set');
      expect(v).toContain('get');
    });

    it('returns format options after --format flag', () => {
      const results = getCompletions('ccli export --format ', 21);
      const v = values(results);
      expect(v).toContain('json');
      expect(v).toContain('yaml');
      expect(v).toContain('text');
    });

    it('returns format options with descriptions', () => {
      const results = getCompletions('ccli export --format ', 21);
      const jsonItem = findItem(results, 'json');
      expect(jsonItem).toBeDefined();
      expect(jsonItem!.description).toBe('Output format');
    });

    it('returns empty array after --output flag (file completion)', () => {
      const results = getCompletions('ccli export --output ', 21);
      expect(results).toEqual([]);
    });

    it('excludes already-used flags', () => {
      const results = getCompletions('ccli get --tree ', 16);
      const v = values(results);
      expect(v).not.toContain('--tree');
    });

    it('filters top-level commands for unknown partial input', () => {
      // 'r' matches 'run', 'remove', 'reset', etc.
      const results = getCompletions('ccli r', 6);
      const v = values(results);
      expect(v).toContain('run');
      expect(v).toContain('remove');
      expect(v).toContain('reset');
      expect(v).not.toContain('set');
    });

    it('returns export types for export command', () => {
      const results = getCompletions('ccli export ', 12);
      const v = values(results);
      expect(v).toContain('data');
      expect(v).toContain('aliases');
      expect(v).toContain('all');
    });

    it('returns export types with descriptions', () => {
      const results = getCompletions('ccli export ', 12);
      const dataItem = findItem(results, 'data');
      expect(dataItem).toBeDefined();
      expect(dataItem!.description).toBe('Export type');
    });

    it('includes global flags when typing a dash', () => {
      const results = getCompletions('ccli get -', 10);
      const v = values(results);
      expect(v).toContain('--debug');
      expect(v).toContain('--version');
      expect(v).toContain('--help');
    });

    it('includes global flags with descriptions', () => {
      const results = getCompletions('ccli get -', 10);
      const debugItem = findItem(results, '--debug');
      expect(debugItem).toBeDefined();
      expect(debugItem!.description).toBe('Enable debug output');
    });
  });

  describe('generateBashScript', () => {
    it('returns a bash completion script', () => {
      const script = generateBashScript();
      expect(script).toContain('_ccli_completions');
      expect(script).toContain('complete');
      expect(script).toContain('COMPREPLY');
    });

    it('strips tab-separated descriptions', () => {
      const script = generateBashScript();
      // Bash script should extract only the value before the tab
      expect(script).toContain('${line%%${tab}*}');
    });
  });

  describe('generateZshScript', () => {
    it('returns a zsh completion script using _describe', () => {
      const script = generateZshScript();
      expect(script).toContain('_ccli_completions');
      expect(script).toContain('compdef');
      expect(script).toContain('_describe');
    });

    it('groups completions and issues separate _describe calls', () => {
      const script = generateZshScript();
      // Uses associative array for groups
      expect(script).toContain('local -A groups');
      // Iterates groups with sorted keys
      expect(script).toContain('${(ko)groups}');
      // Uses _describe per group
      expect(script).toContain('_describe "$grp_name" items');
      // Uses $'\t' for tab
      expect(script).toContain("$'\\t'");
    });
  });

  describe('getDynamicValues via getCompletions', () => {
    it('returns data keys and alias names for dataKey commands', () => {
      const mockData = { server: { ip: '1.2.3.4' } };
      const mockAliases = { myip: 'server.ip' };
      (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('aliases')) return JSON.stringify(mockAliases);
        return JSON.stringify(mockData);
      });

      const results = getCompletions('ccli get ', 9);
      const v = values(results);
      expect(v).toContain('server.ip');
      expect(v).toContain('myip');
    });

    it('returns data keys with "Data key" description', () => {
      const mockData = { server: { ip: '1.2.3.4' } };
      (fs.readFileSync as jest.Mock).mockImplementation(() => JSON.stringify(mockData));

      const results = getCompletions('ccli get ', 9);
      const keyItem = findItem(results, 'server.ip');
      expect(keyItem).toBeDefined();
      expect(keyItem!.description).toBe('Data key');
    });

    it('returns alias names with "Alias" description', () => {
      const mockAliases = { myip: 'server.ip' };
      (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('aliases')) return JSON.stringify(mockAliases);
        return JSON.stringify({});
      });

      const results = getCompletions('ccli get ', 9);
      const aliasItem = findItem(results, 'myip');
      expect(aliasItem).toBeDefined();
      expect(aliasItem!.description).toBe('Alias');
    });

    it('returns alias names for aliasName commands', () => {
      const mockAliases = { myip: 'server.ip', prod: 'server.prod' };
      (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('aliases')) return JSON.stringify(mockAliases);
        return JSON.stringify({});
      });

      const results = getCompletions('ccli alias remove ', 18);
      const v = values(results);
      expect(v).toContain('myip');
      expect(v).toContain('prod');
    });

    it('returns config keys for configKey commands', () => {
      const results = getCompletions('ccli config set ', 16);
      const v = values(results);
      expect(v).toContain('colors');
      expect(v).toContain('theme');
    });

    it('returns config keys with "Config setting" description', () => {
      const results = getCompletions('ccli config set ', 16);
      const colorsItem = findItem(results, 'colors');
      expect(colorsItem).toBeDefined();
      expect(colorsItem!.description).toBe('Config setting');
    });

    it('returns export types for exportType commands', () => {
      const results = getCompletions('ccli export ', 12);
      const v = values(results);
      expect(v).toContain('data');
      expect(v).toContain('aliases');
      expect(v).toContain('all');
    });
  });

  describe('getCompletions edge cases', () => {
    beforeEach(() => {
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({}));
    });

    it('returns top-level commands for unknown command', () => {
      const results = getCompletions('ccli zzz ', 9);
      const v = values(results);
      expect(v).toContain('set');
      expect(v).toContain('get');
    });

    it('returns subcommands when typing partial subcommand', () => {
      const results = getCompletions('ccli alias s', 12);
      const v = values(results);
      expect(v).toContain('set');
      expect(v).not.toContain('remove');
    });

    it('returns subcommand list with trailing space', () => {
      const results = getCompletions('ccli config ', 12);
      const v = values(results);
      expect(v).toContain('set');
      expect(v).toContain('get');
    });

    it('returns format options when filtering partial', () => {
      const results = getCompletions('ccli export --format j', 22);
      const v = values(results);
      expect(v).toContain('json');
      expect(v).not.toContain('yaml');
    });

    it('returns empty for --output flag (file completion)', () => {
      const results = getCompletions('ccli export --output ', 21);
      expect(results).toEqual([]);
    });
  });

  describe('default argType (null) branch', () => {
    it('returns flags for find command when typing a dash', () => {
      const results = getCompletions('ccli find -', 11);
      const v = values(results);
      expect(v).toContain('--keys-only');
      expect(v).toContain('--values-only');
      expect(v).toContain('--entries-only');
      expect(v).toContain('--aliases-only');
      expect(v).toContain('--debug');
    });

    it('returns no completions for find command without a dash', () => {
      const results = getCompletions('ccli find ', 10);
      const v = values(results);
      // find has argType: null, so no data keys or flags
      expect(v).not.toContain('--keys-only');
      expect(v).not.toContain('server.ip');
    });
  });

  describe('partial subcommand that matches nothing', () => {
    it('returns empty result for unmatched subcommand prefix', () => {
      const results = getCompletions('ccli alias x', 12);
      expect(results).toEqual([]);
    });
  });

  describe('error paths in data loading', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('returns empty data keys when loadData throws', () => {
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('read error');
      });
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      // Should not throw, just return empty results without data keys
      const results = getCompletions('ccli get ', 9);
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(0);
    });

    it('returns empty alias names when loadAliases throws', () => {
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('read error');
      });
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const results = getCompletions('ccli alias remove ', 18);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('installCompletions', () => {
    let originalShell: string | undefined;
    let originalHome: string | undefined;
    let consoleSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let exitSpy: jest.SpyInstance;

    beforeEach(() => {
      originalShell = process.env.SHELL;
      originalHome = process.env.HOME;
      process.env.HOME = '/home/testuser';
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      jest.clearAllMocks();
    });

    afterEach(() => {
      process.env.SHELL = originalShell;
      process.env.HOME = originalHome;
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('installs zsh completions', () => {
      process.env.SHELL = '/bin/zsh';
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      installCompletions();

      expect(fs.appendFileSync).toHaveBeenCalled();
      const appendCall = (fs.appendFileSync as jest.Mock).mock.calls[0];
      expect(appendCall[0]).toContain('.zshrc');
      expect(appendCall[1]).toContain('ccli completions zsh');
    });

    it('installs bash completions on Linux', () => {
      process.env.SHELL = '/bin/bash';
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      // Mock platform as linux
      const originalPlatformValue = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      installCompletions();

      expect(fs.appendFileSync).toHaveBeenCalled();
      const appendCall = (fs.appendFileSync as jest.Mock).mock.calls[0];
      expect(appendCall[0]).toContain('.bashrc');

      Object.defineProperty(process, 'platform', { value: originalPlatformValue, configurable: true });
    });

    it('installs bash completions on macOS using .bash_profile', () => {
      process.env.SHELL = '/bin/bash';
      // .bash_profile exists on macOS
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('# existing content');
      const originalPlatformValue = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      installCompletions();

      expect(fs.appendFileSync).toHaveBeenCalled();
      const appendCall = (fs.appendFileSync as jest.Mock).mock.calls[0];
      expect(appendCall[0]).toContain('.bash_profile');

      Object.defineProperty(process, 'platform', { value: originalPlatformValue, configurable: true });
    });

    it('exits with error for unsupported shell', () => {
      process.env.SHELL = '/bin/fish';

      installCompletions();

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('skips if completions already installed', () => {
      process.env.SHELL = '/bin/zsh';
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('eval "$(ccli completions zsh)"');

      installCompletions();

      expect(fs.appendFileSync).not.toHaveBeenCalled();
      const logCalls = consoleSpy.mock.calls;
      const showedAlready = logCalls.some((call: unknown[]) =>
        call.some((arg: unknown) => typeof arg === 'string' && arg.includes('already installed'))
      );
      expect(showedAlready).toBe(true);
    });
  });
});
