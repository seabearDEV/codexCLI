/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';

// Capture tool registrations
type ToolHandler = (params: any) => Promise<any>;
const toolHandlers: Record<string, ToolHandler> = {};

jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: jest.fn().mockImplementation(() => ({
    tool: jest.fn((name: string, _desc: string, _schema: any, handler?: ToolHandler) => {
      // Handle both 3-arg (no schema) and 4-arg overloads
      const fn = handler ?? _schema;
      toolHandlers[name] = fn;
    }),
    connect: jest.fn().mockResolvedValue(undefined as never),
  })),
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn(),
}));

// Mock child_process
const mockExecSync = jest.fn();
jest.mock('child_process', () => ({
  execSync: (...args: any[]) => mockExecSync(...args),
}));

// Mock fs — track written files
const mockFiles: Record<string, boolean> = {};
const mockWrittenFiles: Record<string, string> = {};
const fsMockImpl = {
  existsSync: jest.fn((p: string) => mockFiles[p] === true),
  writeFileSync: jest.fn((p: string, content: string) => {
    mockWrittenFiles[p] = content;
  }),
};
jest.mock('fs', () => ({
  __esModule: true,
  default: fsMockImpl,
  ...fsMockImpl,
}));

// Mock storage — helpers for nested dot-path operations
function getNestedMock(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
}
function setNestedMock(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
function flattenMock(obj: any, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null) Object.assign(result, flattenMock(v, key));
    else result[key] = String(v);
  }
  return result;
}
function removeNestedMock(obj: any, path: string): boolean {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]]) return false;
    cur = cur[parts[i]];
  }
  if (cur[parts[parts.length - 1]] === undefined) return false;
  delete cur[parts[parts.length - 1]];
  return true;
}
const mockData: Record<string, any> = {};
jest.mock('../storage', () => ({
  loadData: jest.fn(() => ({ ...mockData })),
  saveData: jest.fn((d: any) => {
    Object.keys(mockData).forEach(k => delete mockData[k]);
    Object.assign(mockData, d);
  }),
  getValue: jest.fn((key: string) => getNestedMock(mockData, key)),
  setValue: jest.fn((key: string, value: string) => setNestedMock(mockData, key, value)),
  removeValue: jest.fn((key: string) => removeNestedMock(mockData, key)),
  getEntriesFlat: jest.fn(() => flattenMock(mockData)),
}));

// Mock alias
const mockAliases: Record<string, string> = {};
jest.mock('../alias', () => ({
  loadAliases: jest.fn(() => ({ ...mockAliases })),
  saveAliases: jest.fn((a: any) => {
    Object.keys(mockAliases).forEach(k => delete mockAliases[k]);
    Object.assign(mockAliases, a);
  }),
  resolveKey: jest.fn((k: string) => {
    const aliases = { ...mockAliases };
    return aliases[k] ?? k;
  }),
  buildKeyToAliasMap: jest.fn(() => ({})),
}));

jest.mock('../utils/paths', () => ({
  ensureDataDirectoryExists: jest.fn(),
  getDataFilePath: jest.fn(() => '/mock/data.json'),
  getAliasFilePath: jest.fn(() => '/mock/aliases.json'),
  getConfigFilePath: jest.fn(() => '/mock/config.json'),
}));

jest.mock('../formatting', () => ({
  formatTree: jest.fn(() => 'tree-output'),
}));

// Mock config
const mockConfig: Record<string, any> = { colors: true, theme: 'default' };
jest.mock('../config', () => ({
  loadConfig: jest.fn(() => ({ ...mockConfig })),
  getConfigSetting: jest.fn((key: string) => {
    if (key === 'colors' || key === 'theme' || key === 'backend') return mockConfig[key];
    return null;
  }),
  setConfigSetting: jest.fn((key: string, value: any) => {
    mockConfig[key] = value;
  }),
  VALID_CONFIG_KEYS: ['colors', 'theme', 'backend'],
  VALID_THEMES: ['default', 'dark', 'light'],
  VALID_BACKENDS: ['json', 'sqlite'],
}));

// Mock deepMerge — use real implementation
jest.mock('../utils/deepMerge', () => ({
  deepMerge: jest.fn((target: Record<string, any>, source: Record<string, any>) => {
    return { ...target, ...source };
  }),
}));

// Mock commands/init
jest.mock('../commands/init', () => ({
  getExampleData: jest.fn(() => ({ example: 'data' })),
  getExampleAliases: jest.fn(() => ({ ex: 'example' })),
  getExampleConfig: jest.fn(() => ({ colors: true, theme: 'default' })),
}));

// Helper to reset mock data between tests
function resetMocks() {
  Object.keys(mockData).forEach(k => delete mockData[k]);
  Object.keys(mockAliases).forEach(k => delete mockAliases[k]);
  Object.keys(mockConfig).forEach(k => delete mockConfig[k]);
  Object.assign(mockConfig, { colors: true, theme: 'default' });
  Object.keys(mockFiles).forEach(k => delete mockFiles[k]);
  Object.keys(mockWrittenFiles).forEach(k => delete mockWrittenFiles[k]);
  mockExecSync.mockReset();
}

// Import crypto for test data
import { encryptValue } from '../utils/crypto';

// Import the module which triggers tool registrations
beforeAll(async () => {
  await import('../mcp-server');
});

describe('MCP Server Tools', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('codex_set', () => {
    it('sets a value and returns success', async () => {
      const result = await toolHandlers['codex_set']({ key: 'server.ip', value: '10.0.0.1' });
      expect(result.content[0].text).toContain('Set: server.ip = 10.0.0.1');
      expect(result.isError).toBeUndefined();
    });
  });

  describe('codex_get', () => {
    it('returns all entries', async () => {
      Object.assign(mockData, { server: { ip: '10.0.0.1' } });
      const result = await toolHandlers['codex_get']({ key: undefined, format: undefined });
      expect(result.content[0].text).toContain('server.ip: 10.0.0.1');
    });

    it('returns "No entries" when store is empty', async () => {
      const result = await toolHandlers['codex_get']({ key: undefined, format: undefined });
      expect(result.content[0].text).toBe('No entries found.');
    });

    it('returns a leaf value', async () => {
      Object.assign(mockData, { db: { host: 'localhost' } });
      const result = await toolHandlers['codex_get']({ key: 'db.host', format: undefined });
      expect(result.content[0].text).toBe('db.host: localhost');
    });

    it('returns a subtree in flat format', async () => {
      Object.assign(mockData, { db: { host: 'localhost', port: '5432' } });
      const result = await toolHandlers['codex_get']({ key: 'db', format: undefined });
      expect(result.content[0].text).toContain('db.host: localhost');
      expect(result.content[0].text).toContain('db.port: 5432');
    });

    it('returns error for missing key', async () => {
      const result = await toolHandlers['codex_get']({ key: 'missing', format: undefined });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'missing' not found");
    });

    it('uses tree format when requested', async () => {
      Object.assign(mockData, { a: '1' });
      const result = await toolHandlers['codex_get']({ key: undefined, format: 'tree' });
      expect(result.content[0].text).toBe('tree-output');
    });

    it('shows [encrypted] for encrypted leaf value', async () => {
      const encrypted = encryptValue('secret', 'pass');
      Object.assign(mockData, { api: { key: encrypted } });
      const result = await toolHandlers['codex_get']({ key: 'api.key', format: undefined });
      expect(result.content[0].text).toBe('api.key: [encrypted]');
    });

    it('shows [encrypted] for encrypted values in flat listing', async () => {
      const encrypted = encryptValue('secret', 'pass');
      Object.assign(mockData, { api: { key: encrypted }, plain: { val: 'visible' } });
      const result = await toolHandlers['codex_get']({ key: undefined, format: undefined });
      expect(result.content[0].text).toContain('api.key: [encrypted]');
      expect(result.content[0].text).toContain('plain.val: visible');
    });

    it('shows [encrypted] for encrypted values in subtree flat format', async () => {
      const encrypted = encryptValue('secret', 'pass');
      Object.assign(mockData, { api: { key: encrypted, name: 'myapi' } });
      const result = await toolHandlers['codex_get']({ key: 'api', format: undefined });
      expect(result.content[0].text).toContain('api.key: [encrypted]');
      expect(result.content[0].text).toContain('api.name: myapi');
    });
  });

  describe('codex_remove', () => {
    it('removes an existing key', async () => {
      Object.assign(mockData, { foo: 'bar' });
      const result = await toolHandlers['codex_remove']({ key: 'foo' });
      expect(result.content[0].text).toContain('Removed: foo');
    });

    it('returns error for missing key', async () => {
      const result = await toolHandlers['codex_remove']({ key: 'nope' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'nope' not found");
    });
  });

  describe('codex_search', () => {
    it('finds matching entries', async () => {
      Object.assign(mockData, { server: { ip: '10.0.0.1' } });
      const result = await toolHandlers['codex_search']({
        searchTerm: 'server',
        keysOnly: undefined, valuesOnly: undefined,
        aliasesOnly: undefined, entriesOnly: undefined,
      });
      expect(result.content[0].text).toContain('server.ip');
    });

    it('respects keysOnly', async () => {
      Object.assign(mockData, { abc: 'xyz' });
      const result = await toolHandlers['codex_search']({
        searchTerm: 'xyz',
        keysOnly: true, valuesOnly: undefined,
        aliasesOnly: undefined, entriesOnly: undefined,
      });
      // 'xyz' is only in value, keysOnly should not match
      expect(result.content[0].text).toContain('No results');
    });

    it('respects valuesOnly', async () => {
      Object.assign(mockData, { abc: 'xyz' });
      const result = await toolHandlers['codex_search']({
        searchTerm: 'abc',
        keysOnly: undefined, valuesOnly: true,
        aliasesOnly: undefined, entriesOnly: undefined,
      });
      // 'abc' is only in key, valuesOnly should not match
      expect(result.content[0].text).toContain('No results');
    });

    it('respects aliasesOnly — skips data entries', async () => {
      Object.assign(mockData, { server: { ip: '10.0.0.1' } });
      Object.assign(mockAliases, { srv: 'server.ip' });
      const result = await toolHandlers['codex_search']({
        searchTerm: 'server',
        keysOnly: undefined, valuesOnly: undefined,
        aliasesOnly: true, entriesOnly: undefined,
      });
      // Should find alias but not the data entry
      expect(result.content[0].text).toContain('[alias] srv -> server.ip');
      expect(result.content[0].text).not.toContain('server.ip: 10.0.0.1');
    });

    it('respects entriesOnly — skips alias search', async () => {
      Object.assign(mockData, { server: { ip: '10.0.0.1' } });
      Object.assign(mockAliases, { srv: 'server.ip' });
      const result = await toolHandlers['codex_search']({
        searchTerm: 'server',
        keysOnly: undefined, valuesOnly: undefined,
        aliasesOnly: undefined, entriesOnly: true,
      });
      // Should find data entry but not the alias
      expect(result.content[0].text).toContain('server.ip: 10.0.0.1');
      expect(result.content[0].text).not.toContain('[alias]');
    });

    it('returns no results message', async () => {
      const result = await toolHandlers['codex_search']({
        searchTerm: 'nonexistent',
        keysOnly: undefined, valuesOnly: undefined,
        aliasesOnly: undefined, entriesOnly: undefined,
      });
      expect(result.content[0].text).toContain("No results found for 'nonexistent'");
    });

    it('shows [encrypted] for encrypted values matched by key', async () => {
      const encrypted = encryptValue('secret', 'pass');
      Object.assign(mockData, { api: { key: encrypted } });
      const result = await toolHandlers['codex_search']({
        searchTerm: 'api',
        keysOnly: undefined, valuesOnly: undefined,
        aliasesOnly: undefined, entriesOnly: undefined,
      });
      expect(result.content[0].text).toContain('api.key: [encrypted]');
    });

    it('does not match encrypted values by value content', async () => {
      const encrypted = encryptValue('findme', 'pass');
      Object.assign(mockData, { api: { key: encrypted } });
      const result = await toolHandlers['codex_search']({
        searchTerm: 'findme',
        keysOnly: undefined, valuesOnly: true,
        aliasesOnly: undefined, entriesOnly: undefined,
      });
      expect(result.content[0].text).toContain('No results');
    });
  });

  describe('codex_alias_set', () => {
    it('creates an alias', async () => {
      const result = await toolHandlers['codex_alias_set']({ alias: 'srv', path: 'server.ip' });
      expect(result.content[0].text).toContain('Alias set: srv -> server.ip');
    });
  });

  describe('codex_alias_remove', () => {
    it('removes an existing alias', async () => {
      Object.assign(mockAliases, { srv: 'server.ip' });
      const result = await toolHandlers['codex_alias_remove']({ alias: 'srv' });
      expect(result.content[0].text).toContain('Alias removed: srv');
    });

    it('returns error for missing alias', async () => {
      const result = await toolHandlers['codex_alias_remove']({ alias: 'nope' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'nope' not found");
    });
  });

  describe('codex_alias_list', () => {
    it('lists all aliases', async () => {
      Object.assign(mockAliases, { srv: 'server.ip', db: 'database.host' });
      const result = await toolHandlers['codex_alias_list']({});
      expect(result.content[0].text).toContain('srv -> server.ip');
      expect(result.content[0].text).toContain('db -> database.host');
    });

    it('returns message when no aliases defined', async () => {
      const result = await toolHandlers['codex_alias_list']({});
      expect(result.content[0].text).toBe('No aliases defined.');
    });
  });

  describe('codex_run', () => {
    it('executes a stored command and returns stdout with command prefix', async () => {
      Object.assign(mockData, { cmd: 'echo hello' });
      mockExecSync.mockReturnValue('hello\n');
      const result = await toolHandlers['codex_run']({ key: 'cmd', dry: undefined });
      expect(result.content[0].text).toBe('$ echo hello\nhello\n');
      expect(mockExecSync).toHaveBeenCalledWith('echo hello', expect.objectContaining({
        encoding: 'utf-8',
        shell: process.env.SHELL || '/bin/sh',
        timeout: 30000,
      }));
    });

    it('returns the command with dry: true', async () => {
      Object.assign(mockData, { cmd: 'echo hello' });
      const result = await toolHandlers['codex_run']({ key: 'cmd', dry: true });
      expect(result.content[0].text).toBe('$ echo hello');
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('returns error for missing key', async () => {
      const result = await toolHandlers['codex_run']({ key: 'nope', dry: undefined });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'nope' not found");
    });

    it('returns error when value is not a string', async () => {
      Object.assign(mockData, { nested: { a: '1' } });
      const result = await toolHandlers['codex_run']({ key: 'nested', dry: undefined });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not a string command');
    });

    it('returns exit code and stderr on failure with command prefix', async () => {
      Object.assign(mockData, { cmd: 'false' });
      mockExecSync.mockImplementation(() => {
        const err: any = new Error('fail');
        err.status = 1;
        err.stderr = 'command failed';
        throw err;
      });
      const result = await toolHandlers['codex_run']({ key: 'cmd', dry: undefined });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('$ false');
      expect(result.content[0].text).toContain('exit 1');
      expect(result.content[0].text).toContain('command failed');
    });

    it('resolves alias before executing', async () => {
      Object.assign(mockData, { commands: { greet: 'echo hello' } });
      Object.assign(mockAliases, { hi: 'commands.greet' });
      mockExecSync.mockReturnValue('hello\n');
      const result = await toolHandlers['codex_run']({ key: 'hi', dry: undefined });
      expect(result.content[0].text).toBe('$ echo hello\nhello\n');
    });

    it('resolves alias with dry run', async () => {
      Object.assign(mockData, { commands: { greet: 'echo hello' } });
      Object.assign(mockAliases, { hi: 'commands.greet' });
      const result = await toolHandlers['codex_run']({ key: 'hi', dry: true });
      expect(result.content[0].text).toBe('$ echo hello');
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('returns error when value is encrypted', async () => {
      const encrypted = encryptValue('echo secret', 'pass');
      Object.assign(mockData, { cmd: encrypted });
      const result = await toolHandlers['codex_run']({ key: 'cmd', dry: undefined });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('encrypted');
      expect(result.content[0].text).toContain('not supported via MCP');
      expect(mockExecSync).not.toHaveBeenCalled();
    });
  });

  describe('codex_config_get', () => {
    it('returns all config settings when no key provided', async () => {
      const result = await toolHandlers['codex_config_get']({ key: undefined });
      expect(result.content[0].text).toContain('colors: true');
      expect(result.content[0].text).toContain('theme: default');
    });

    it('returns a single config value', async () => {
      const result = await toolHandlers['codex_config_get']({ key: 'theme' });
      expect(result.content[0].text).toBe('theme: default');
    });

    it('returns error for unknown key', async () => {
      const result = await toolHandlers['codex_config_get']({ key: 'unknown' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown config key: 'unknown'");
    });
  });

  describe('codex_config_set', () => {
    it('sets a valid config key', async () => {
      const result = await toolHandlers['codex_config_set']({ key: 'theme', value: 'dark' });
      expect(result.content[0].text).toContain('Config set: theme = dark');
    });

    it('converts boolean for colors', async () => {
      const result = await toolHandlers['codex_config_set']({ key: 'colors', value: 'true' });
      expect(result.content[0].text).toContain('Config set: colors = true');
    });

    it('converts "1" to true for colors', async () => {
      const result = await toolHandlers['codex_config_set']({ key: 'colors', value: '1' });
      expect(result.content[0].text).toContain('Config set: colors = 1');
    });

    it('returns error for unknown key', async () => {
      const result = await toolHandlers['codex_config_set']({ key: 'bad', value: 'x' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown config key: 'bad'");
    });
  });

  describe('codex_export', () => {
    it('exports data only as valid JSON', async () => {
      Object.assign(mockData, { a: '1' });
      const result = await toolHandlers['codex_export']({ type: 'data', pretty: undefined });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual({ a: '1' });
      expect(result.content[0].text).not.toContain('---');
    });

    it('exports aliases only as valid JSON', async () => {
      Object.assign(mockAliases, { srv: 'server.ip' });
      const result = await toolHandlers['codex_export']({ type: 'aliases', pretty: undefined });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual({ srv: 'server.ip' });
      expect(result.content[0].text).not.toContain('---');
    });

    it('exports all as structured JSON with data and aliases keys', async () => {
      Object.assign(mockData, { a: '1' });
      Object.assign(mockAliases, { x: 'y' });
      const result = await toolHandlers['codex_export']({ type: 'all', pretty: undefined });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual({ data: { a: '1' }, aliases: { x: 'y' } });
    });

    it('pretty-prints when requested', async () => {
      Object.assign(mockData, { a: '1' });
      const result = await toolHandlers['codex_export']({ type: 'data', pretty: true });
      expect(result.content[0].text).toContain('  "a": "1"');
    });

    it('masks encrypted values in data export', async () => {
      const encrypted = encryptValue('secret', 'pass');
      Object.assign(mockData, { api: { key: encrypted }, plain: 'visible' });
      const result = await toolHandlers['codex_export']({ type: 'data', pretty: undefined });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.api.key).toBe('[encrypted]');
      expect(parsed.plain).toBe('visible');
      expect(result.content[0].text).not.toContain('encrypted::v1:');
    });

    it('masks encrypted values in all export', async () => {
      const encrypted = encryptValue('secret', 'pass');
      Object.assign(mockData, { secret: encrypted });
      const result = await toolHandlers['codex_export']({ type: 'all', pretty: undefined });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.secret).toBe('[encrypted]');
    });
  });

  describe('codex_import', () => {
    it('imports data (replace)', async () => {
      Object.assign(mockData, { old: 'val' });
      const result = await toolHandlers['codex_import']({
        type: 'data', json: '{"new":"val"}', merge: undefined,
      });
      expect(result.content[0].text).toContain('Data imported successfully');
      expect(mockData).toEqual({ new: 'val' });
    });

    it('imports data (merge)', async () => {
      Object.assign(mockData, { old: 'val' });
      const result = await toolHandlers['codex_import']({
        type: 'data', json: '{"new":"val"}', merge: true,
      });
      expect(result.content[0].text).toContain('Data merged successfully');
    });

    it('imports aliases (replace)', async () => {
      Object.assign(mockAliases, { old: 'path.old' });
      const result = await toolHandlers['codex_import']({
        type: 'aliases', json: '{"new":"path.new"}', merge: undefined,
      });
      expect(result.content[0].text).toContain('Aliases imported successfully');
      expect(mockAliases).toEqual({ new: 'path.new' });
    });

    it('returns error for invalid JSON', async () => {
      const result = await toolHandlers['codex_import']({
        type: 'data', json: 'not-json', merge: undefined,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid JSON');
    });

    it('returns error for non-object JSON', async () => {
      const result = await toolHandlers['codex_import']({
        type: 'data', json: '[1,2,3]', merge: undefined,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('must be an object');
    });

    it('imports all (replace) with structured JSON', async () => {
      Object.assign(mockData, { old: 'data' });
      Object.assign(mockAliases, { old: 'alias.path' });
      const json = JSON.stringify({ data: { new: 'data' }, aliases: { new: 'alias.path' } });
      const result = await toolHandlers['codex_import']({
        type: 'all', json, merge: undefined,
      });
      expect(result.content[0].text).toContain('Data and aliases imported successfully');
      expect(mockData).toEqual({ new: 'data' });
      expect(mockAliases).toEqual({ new: 'alias.path' });
    });

    it('imports all (merge) with structured JSON', async () => {
      Object.assign(mockData, { existing: 'data' });
      Object.assign(mockAliases, { existing: 'alias.path' });
      const json = JSON.stringify({ data: { added: 'data' }, aliases: { added: 'alias.path' } });
      const result = await toolHandlers['codex_import']({
        type: 'all', json, merge: true,
      });
      expect(result.content[0].text).toContain('Data and aliases merged successfully');
      expect(mockData).toEqual({ existing: 'data', added: 'data' });
      expect(mockAliases).toEqual({ existing: 'alias.path', added: 'alias.path' });
    });

    it('returns error when importing all without data/aliases keys', async () => {
      const result = await toolHandlers['codex_import']({
        type: 'all', json: '{"foo":"bar"}', merge: undefined,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('requires {"data"');
    });
  });

  describe('codex_export / codex_import round-trip', () => {
    it('round-trips export all → import all', async () => {
      Object.assign(mockData, { server: { ip: '10.0.0.1' } });
      Object.assign(mockAliases, { srv: 'server.ip' });

      // Export
      const exported = await toolHandlers['codex_export']({ type: 'all', pretty: undefined });
      const json = exported.content[0].text;

      // Clear stores
      Object.keys(mockData).forEach(k => delete mockData[k]);
      Object.keys(mockAliases).forEach(k => delete mockAliases[k]);
      expect(mockData).toEqual({});
      expect(mockAliases).toEqual({});

      // Import
      const result = await toolHandlers['codex_import']({ type: 'all', json, merge: undefined });
      expect(result.content[0].text).toContain('Data and aliases imported successfully');
      expect(mockData).toEqual({ server: { ip: '10.0.0.1' } });
      expect(mockAliases).toEqual({ srv: 'server.ip' });
    });
  });

  describe('codex_reset', () => {
    it('resets data', async () => {
      Object.assign(mockData, { a: '1' });
      const result = await toolHandlers['codex_reset']({ type: 'data' });
      expect(result.content[0].text).toContain('Data reset to empty state');
      expect(mockData).toEqual({});
    });

    it('resets aliases', async () => {
      Object.assign(mockAliases, { srv: 'server.ip' });
      const result = await toolHandlers['codex_reset']({ type: 'aliases' });
      expect(result.content[0].text).toContain('Aliases reset to empty state');
      expect(mockAliases).toEqual({});
    });

    it('resets all', async () => {
      Object.assign(mockData, { a: '1' });
      Object.assign(mockAliases, { srv: 'server.ip' });
      const result = await toolHandlers['codex_reset']({ type: 'all' });
      expect(result.content[0].text).toContain('Data and aliases reset to empty state');
      expect(mockData).toEqual({});
      expect(mockAliases).toEqual({});
    });
  });

  describe('codex_init_examples', () => {
    it('initializes example data when no files exist', async () => {
      const result = await toolHandlers['codex_init_examples']({ force: undefined });
      expect(result.content[0].text).toContain('Example data, aliases, and config initialized');
      expect(mockWrittenFiles['/mock/data.json']).toBeDefined();
      expect(mockWrittenFiles['/mock/aliases.json']).toBeDefined();
      expect(mockWrittenFiles['/mock/config.json']).toBeDefined();
    });

    it('returns error when files exist and force is not set', async () => {
      mockFiles['/mock/data.json'] = true;
      const result = await toolHandlers['codex_init_examples']({ force: undefined });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('already exist');
    });

    it('overwrites when force is true', async () => {
      mockFiles['/mock/data.json'] = true;
      const result = await toolHandlers['codex_init_examples']({ force: true });
      expect(result.content[0].text).toContain('Example data, aliases, and config initialized');
    });
  });
});
