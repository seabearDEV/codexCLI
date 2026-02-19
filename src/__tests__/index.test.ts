/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock functions — defined at top level, cleared between tests
const mockSetEntry = vi.fn().mockResolvedValue(undefined);
const mockGetEntry = vi.fn();
const mockRunCommand = vi.fn().mockResolvedValue(undefined);
const mockSearchEntries = vi.fn();
const mockRemoveEntry = vi.fn();
const mockHandleConfig = vi.fn();
const mockConfigSet = vi.fn();
const mockInitializeExampleData = vi.fn();
const mockExportData = vi.fn();
const mockImportData = vi.fn().mockResolvedValue(undefined);
const mockResetData = vi.fn().mockResolvedValue(undefined);

const mockSetAlias = vi.fn();
const mockRemoveAlias = vi.fn();
const mockLoadAliases = vi.fn().mockReturnValue({});
const mockResolveKey = vi.fn((k: string) => k);

const mockShowHelp = vi.fn();
const mockShowExamples = vi.fn();
const identity = (s: string) => s;
const mockColor = {
  boldColors: { magenta: identity },
  gray: identity,
  cyan: identity,
  green: identity,
  red: identity,
};

const mockDisplayAliases = vi.fn();

const mockGetCompletions = vi.fn().mockReturnValue(['comp1', 'comp2']);
const mockGenerateBashScript = vi.fn().mockReturnValue('bash-script');
const mockGenerateZshScript = vi.fn().mockReturnValue('zsh-script');
const mockInstallCompletions = vi.fn();

function setupMocks() {
  vi.doMock('../commands', () => ({
    setEntry: mockSetEntry,
    getEntry: mockGetEntry,
    runCommand: mockRunCommand,
    searchEntries: mockSearchEntries,
    removeEntry: mockRemoveEntry,
    handleConfig: mockHandleConfig,
    configSet: mockConfigSet,
    initializeExampleData: mockInitializeExampleData,
    exportData: mockExportData,
    importData: mockImportData,
    resetData: mockResetData,
  }));
  vi.doMock('../alias', () => ({
    setAlias: mockSetAlias,
    removeAlias: mockRemoveAlias,
    loadAliases: mockLoadAliases,
    resolveKey: mockResolveKey,
  }));
  vi.doMock('../formatting', () => ({
    showHelp: mockShowHelp,
    showExamples: mockShowExamples,
    color: mockColor,
  }));
  vi.doMock('../commands/helpers', () => ({
    displayAliases: mockDisplayAliases,
  }));
  vi.doMock('../completions', () => ({
    getCompletions: mockGetCompletions,
    generateBashScript: mockGenerateBashScript,
    generateZshScript: mockGenerateZshScript,
    installCompletions: mockInstallCompletions,
  }));
}

const originalArgv = process.argv;

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  // Re-apply default return values after clearAllMocks
  mockSetEntry.mockResolvedValue(undefined);
  mockRunCommand.mockResolvedValue(undefined);
  mockImportData.mockResolvedValue(undefined);
  mockResetData.mockResolvedValue(undefined);
  mockLoadAliases.mockReturnValue({});
  mockResolveKey.mockImplementation((k: string) => k);
  mockGetCompletions.mockReturnValue([
    { value: 'comp1', description: 'First', group: 'commands' },
    { value: 'comp2', description: 'Second', group: 'commands' },
  ]);
  mockGenerateBashScript.mockReturnValue('bash-script');
  mockGenerateZshScript.mockReturnValue('zsh-script');

  setupMocks();
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`EXIT_${code ?? 0}`);
  }) as any);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  process.argv = originalArgv;
});

async function loadCLI(...args: string[]) {
  process.argv = ['node', 'ccli', ...args];
  await import('../index');
}

describe('CLI Entry Point (index.ts)', () => {
  // --- Early exit: --get-completions ---

  it('--get-completions triggers early exit with completions', async () => {
    await expect(loadCLI('--get-completions', 'ccli s')).rejects.toThrow('EXIT_0');
    expect(mockGetCompletions).toHaveBeenCalledWith('ccli s', 6);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('--get-completions with no extra args uses defaults', async () => {
    await expect(loadCLI('--get-completions')).rejects.toThrow('EXIT_0');
    expect(mockGetCompletions).toHaveBeenCalledWith('', 0);
  });

  // --- No args: show help ---

  it('shows help when no arguments provided', async () => {
    await loadCLI();
    expect(mockShowHelp).toHaveBeenCalled();
  });

  // --- Debug flag ---

  it('--debug flag sets DEBUG env via preAction hook', async () => {
    delete process.env.DEBUG;
    await loadCLI('--debug', 'get');
    expect(process.env.DEBUG).toBe('true');
    delete process.env.DEBUG;
  });

  // --- Core commands ---

  it('set command calls setEntry with joined value', async () => {
    await loadCLI('set', '--force', 'my.key', 'my', 'value');
    expect(mockSetEntry).toHaveBeenCalledWith('my.key', 'my value', true, undefined, undefined);
  });

  it('get command resolves key via resolveKey before calling getEntry', async () => {
    mockResolveKey.mockReturnValueOnce('resolved.key');
    await loadCLI('get', 'my.key');
    expect(mockResolveKey).toHaveBeenCalledWith('my.key');
    expect(mockGetEntry).toHaveBeenCalledWith('resolved.key', expect.any(Object));
  });

  it('get without key calls getEntry with undefined', async () => {
    await loadCLI('get');
    expect(mockGetEntry).toHaveBeenCalledWith(undefined, expect.any(Object));
  });

  it('run command resolves key and calls runCommand', async () => {
    mockResolveKey.mockReturnValueOnce('resolved.cmd');
    await loadCLI('run', 'my.cmd');
    expect(mockResolveKey).toHaveBeenCalledWith('my.cmd');
    expect(mockRunCommand).toHaveBeenCalledWith('resolved.cmd', expect.any(Object));
  });

  it('find command calls searchEntries with options', async () => {
    await loadCLI('find', 'myterm', '--keys-only');
    expect(mockSearchEntries).toHaveBeenCalledWith('myterm', expect.objectContaining({ keysOnly: true }));
  });

  it('remove command resolves key via resolveKey before calling removeEntry', async () => {
    mockResolveKey.mockReturnValueOnce('resolved.key');
    await loadCLI('remove', 'my.key');
    expect(mockResolveKey).toHaveBeenCalledWith('my.key');
    expect(mockRemoveEntry).toHaveBeenCalledWith('resolved.key');
  });

  // --- Alias commands ---

  it('alias set calls setAlias with joined args', async () => {
    await loadCLI('alias', 'set', 'myalias', 'my.path');
    expect(mockSetAlias).toHaveBeenCalledWith('myalias', 'my.path');
  });

  it('alias remove calls removeAlias', async () => {
    await loadCLI('alias', 'remove', 'myalias');
    expect(mockRemoveAlias).toHaveBeenCalledWith('myalias');
  });

  it('alias get calls displayAliases with all aliases', async () => {
    mockLoadAliases.mockReturnValueOnce({ srv: 'server.ip' });
    await loadCLI('alias', 'get');
    expect(mockDisplayAliases).toHaveBeenCalledWith(
      { srv: 'server.ip' },
      { tree: undefined, name: undefined }
    );
  });

  it('alias get with no aliases calls displayAliases with empty object', async () => {
    mockLoadAliases.mockReturnValueOnce({});
    await loadCLI('alias', 'get');
    expect(mockDisplayAliases).toHaveBeenCalledWith({}, { tree: undefined, name: undefined });
  });

  it('alias get with specific name passes name to displayAliases', async () => {
    mockLoadAliases.mockReturnValueOnce({ myalias: 'some.path' });
    await loadCLI('alias', 'get', 'myalias');
    expect(mockDisplayAliases).toHaveBeenCalledWith(
      { myalias: 'some.path' },
      { tree: undefined, name: 'myalias' }
    );
  });

  it('alias get with missing name passes name to displayAliases', async () => {
    mockLoadAliases.mockReturnValueOnce({});
    await loadCLI('alias', 'get', 'missing');
    expect(mockDisplayAliases).toHaveBeenCalledWith(
      {},
      { tree: undefined, name: 'missing' }
    );
  });

  it('alias get --tree passes tree option to displayAliases', async () => {
    mockLoadAliases.mockReturnValueOnce({ srv: 'server.ip' });
    await loadCLI('alias', 'get', '--tree');
    expect(mockDisplayAliases).toHaveBeenCalledWith(
      { srv: 'server.ip' },
      { tree: true, name: undefined }
    );
  });

  it('alias get --tree with no aliases passes tree option to displayAliases', async () => {
    mockLoadAliases.mockReturnValueOnce({});
    await loadCLI('alias', 'get', '--tree');
    expect(mockDisplayAliases).toHaveBeenCalledWith({}, { tree: true, name: undefined });
  });

  it('alias get --tree with specific name passes both options', async () => {
    mockLoadAliases.mockReturnValueOnce({ srv: 'server.ip' });
    await loadCLI('alias', 'get', '--tree', 'srv');
    expect(mockDisplayAliases).toHaveBeenCalledWith(
      { srv: 'server.ip' },
      { tree: true, name: 'srv' }
    );
  });

  it('alias get --tree with missing name passes both options', async () => {
    mockLoadAliases.mockReturnValueOnce({ srv: 'server.ip' });
    await loadCLI('alias', 'get', '--tree', 'missing');
    expect(mockDisplayAliases).toHaveBeenCalledWith(
      { srv: 'server.ip' },
      { tree: true, name: 'missing' }
    );
  });

  // --- Config commands ---

  it('config with no subcommand calls handleConfig', async () => {
    await loadCLI('config');
    expect(mockHandleConfig).toHaveBeenCalled();
  });

  it('config set calls configSet', async () => {
    await loadCLI('config', 'set', 'theme', 'dark');
    expect(mockConfigSet).toHaveBeenCalledWith('theme', 'dark');
  });

  it('config get calls handleConfig with key', async () => {
    await loadCLI('config', 'get', 'colors');
    expect(mockHandleConfig).toHaveBeenCalledWith('colors');
  });

  // --- Other commands ---

  it('get --keys-only calls getEntry with keysOnly option', async () => {
    await loadCLI('get', '--keys-only');
    expect(mockGetEntry).toHaveBeenCalledWith(undefined, expect.objectContaining({ keysOnly: true }));
  });

  it('init calls initializeExampleData', async () => {
    await loadCLI('init');
    expect(mockInitializeExampleData).toHaveBeenCalled();
  });

  it('examples calls showExamples', async () => {
    await loadCLI('examples');
    expect(mockShowExamples).toHaveBeenCalled();
  });

  it('export calls exportData', async () => {
    await loadCLI('export', 'data');
    expect(mockExportData).toHaveBeenCalledWith('data', expect.any(Object));
  });

  it('import calls importData', async () => {
    await loadCLI('import', 'data', 'file.json');
    expect(mockImportData).toHaveBeenCalledWith('data', 'file.json', expect.any(Object));
  });

  it('reset calls resetData', async () => {
    await loadCLI('reset', 'data');
    expect(mockResetData).toHaveBeenCalledWith('data', expect.any(Object));
  });

  // --- Completions commands ---

  it('completions bash outputs bash script', async () => {
    await loadCLI('completions', 'bash');
    expect(mockGenerateBashScript).toHaveBeenCalled();
    expect(process.stdout.write).toHaveBeenCalledWith('bash-script');
  });

  it('completions zsh outputs zsh script', async () => {
    await loadCLI('completions', 'zsh');
    expect(mockGenerateZshScript).toHaveBeenCalled();
    expect(process.stdout.write).toHaveBeenCalledWith('zsh-script');
  });

  it('completions install calls installCompletions', async () => {
    await loadCLI('completions', 'install');
    expect(mockInstallCompletions).toHaveBeenCalled();
  });

  // --- Help command ---

  it('no-args shows help', async () => {
    await loadCLI();
    expect(mockShowHelp).toHaveBeenCalled();
  });
});
