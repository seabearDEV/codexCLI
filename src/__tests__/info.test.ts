import * as fs from 'fs';
import { showInfo } from '../commands/info';

jest.mock('../config', () => ({
  loadConfig: jest.fn(() => ({ colors: false, theme: 'default', backend: 'json' })),
}));

jest.mock('../storage', () => ({
  getEntriesFlat: jest.fn(() => ({
    'server.ip': '192.168.1.1',
    'server.port': '22',
    'db.host': 'localhost',
  })),
}));

jest.mock('../alias', () => ({
  loadAliases: jest.fn(() => ({
    myip: 'server.ip',
    prod: 'server.production',
  })),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue('{}'),
  statSync: jest.fn().mockReturnValue({ mtimeMs: 0 }),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

describe('showInfo', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  function getOutput(): string {
    return consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
  }

  it('outputs version from package.json', () => {
    const { version } = require('../../package.json');
    showInfo();
    expect(getOutput()).toContain(version);
  });

  it('shows correct entry count', () => {
    showInfo();
    expect(getOutput()).toContain('3');
  });

  it('shows correct alias count', () => {
    showInfo();
    expect(getOutput()).toContain('2');
  });

  it('shows backend type', () => {
    showInfo();
    expect(getOutput()).toContain('json');
  });

  it('shows storage paths for json backend', () => {
    showInfo();
    const output = getOutput();
    expect(output).toContain('data.json');
    expect(output).toContain('aliases.json');
    expect(output).toContain('config.json');
  });

  it('shows database path for sqlite backend', () => {
    const { loadConfig } = require('../config');
    (loadConfig as jest.Mock).mockReturnValue({ colors: false, theme: 'default', backend: 'sqlite' });

    showInfo();
    const output = getOutput();
    expect(output).toContain('codexcli.db');

    (loadConfig as jest.Mock).mockReturnValue({ colors: false, theme: 'default', backend: 'json' });
  });

  it('shows the box header', () => {
    showInfo();
    const output = getOutput();
    expect(output).toContain('CodexCLI - Info');
  });
});

describe('showInfo with empty data', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const { getEntriesFlat } = require('../storage');
    const { loadAliases } = require('../alias');
    (getEntriesFlat as jest.Mock).mockReturnValue({});
    (loadAliases as jest.Mock).mockReturnValue({});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    const { getEntriesFlat } = require('../storage');
    const { loadAliases } = require('../alias');
    (getEntriesFlat as jest.Mock).mockReturnValue({
      'server.ip': '192.168.1.1',
      'server.port': '22',
      'db.host': 'localhost',
    });
    (loadAliases as jest.Mock).mockReturnValue({
      myip: 'server.ip',
      prod: 'server.production',
    });
  });

  it('handles 0 entries and 0 aliases', () => {
    showInfo();
    const output = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    // Should contain "0" for both counts
    const lines = output.split('\n');
    const entriesLine = lines.find(l => l.includes('Entries:'));
    const aliasesLine = lines.find(l => l.includes('Aliases:') && !l.includes('aliases.json'));
    expect(entriesLine).toContain('0');
    expect(aliasesLine).toContain('0');
  });
});

describe('showInfo shell completions', () => {
  let consoleSpy: jest.SpyInstance;
  let originalShell: string | undefined;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    originalShell = process.env.SHELL;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.env.SHELL = originalShell;
  });

  function getOutput(): string {
    return consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
  }

  it('shows installed when rc file contains ccli completions', () => {
    process.env.SHELL = '/bin/zsh';
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('eval "$(ccli completions zsh)"');

    showInfo();
    expect(getOutput()).toContain('installed');
  });

  it('shows not installed when rc file does not contain ccli completions', () => {
    process.env.SHELL = '/bin/zsh';
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('# empty rc');

    showInfo();
    expect(getOutput()).toContain('not installed');
  });

  it('shows not installed when shell is unrecognized', () => {
    process.env.SHELL = '/bin/fish';
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('{}');

    showInfo();
    expect(getOutput()).toContain('not installed');
  });
});
