/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock functions — defined at top level, cleared between tests
const mockSetEntry = jest.fn().mockResolvedValue(undefined);
const mockGetEntry = jest.fn();
const mockRunCommand = jest.fn().mockResolvedValue(undefined);
const mockSearchEntries = jest.fn();
const mockRemoveEntry = jest.fn();
const mockHandleConfig = jest.fn();
const mockConfigSet = jest.fn();
const mockInitializeExampleData = jest.fn();
const mockExportData = jest.fn();
const mockImportData = jest.fn().mockResolvedValue(undefined);
const mockResetData = jest.fn().mockResolvedValue(undefined);

const mockSetAlias = jest.fn();
const mockRemoveAlias = jest.fn();
const mockLoadAliases = jest.fn().mockReturnValue({});
const mockResolveKey = jest.fn((k: string) => k);

const mockShowHelp = jest.fn();
const mockShowExamples = jest.fn();
const identity = (s: string) => s;
const mockColor = {
  boldColors: { magenta: identity },
  gray: identity,
  cyan: identity,
  green: identity,
  red: identity,
};

const mockDisplayAliases = jest.fn();

const mockGetCompletions = jest.fn().mockReturnValue(['comp1', 'comp2']);
const mockGenerateBashScript = jest.fn().mockReturnValue('bash-script');
const mockGenerateZshScript = jest.fn().mockReturnValue('zsh-script');
const mockInstallCompletions = jest.fn();

function setupMocks() {
  jest.doMock('../commands', () => ({
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
  jest.doMock('../alias', () => ({
    setAlias: mockSetAlias,
    removeAlias: mockRemoveAlias,
    loadAliases: mockLoadAliases,
    resolveKey: mockResolveKey,
  }));
  jest.doMock('../formatting', () => ({
    showHelp: mockShowHelp,
    showExamples: mockShowExamples,
    color: mockColor,
  }));
  jest.doMock('../commands/helpers', () => ({
    displayAliases: mockDisplayAliases,
  }));
  jest.doMock('../completions', () => ({
    getCompletions: mockGetCompletions,
    generateBashScript: mockGenerateBashScript,
    generateZshScript: mockGenerateZshScript,
    installCompletions: mockInstallCompletions,
  }));
}

const originalArgv = process.argv;

beforeEach(() => {
  jest.resetModules();
  jest.restoreAllMocks();
  jest.clearAllMocks();
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
  jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`EXIT_${code ?? 0}`);
  }) as any);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  process.argv = originalArgv;
});

function loadCLI(...args: string[]) {
  process.argv = ['node', 'ccli', ...args];
  require('../index');
}

describe('CLI Entry Point (index.ts)', () => {
  // --- Early exit: --get-completions ---

  it('--get-completions triggers early exit with completions', () => {
    expect(() => loadCLI('--get-completions', 'ccli s')).toThrow('EXIT_0');
    expect(mockGetCompletions).toHaveBeenCalledWith('ccli s', 6);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('--get-completions with no extra args uses defaults', () => {
    expect(() => loadCLI('--get-completions')).toThrow('EXIT_0');
    expect(mockGetCompletions).toHaveBeenCalledWith('', 0);
  });

  // --- No args: show help ---

  it('shows help when no arguments provided', () => {
    loadCLI();
    expect(mockShowHelp).toHaveBeenCalled();
  });

  // --- Debug flag ---

  it('--debug flag sets DEBUG env via preAction hook', () => {
    delete process.env.DEBUG;
    loadCLI('--debug', 'get');
    expect(process.env.DEBUG).toBe('true');
    delete process.env.DEBUG;
  });

  // --- Core commands ---

  it('set command calls setEntry with joined value', () => {
    loadCLI('set', '--force', 'my.key', 'my', 'value');
    expect(mockSetEntry).toHaveBeenCalledWith('my.key', 'my value', true, undefined, undefined);
  });

  it('get command resolves key via resolveKey before calling getEntry', () => {
    mockResolveKey.mockReturnValueOnce('resolved.key');
    loadCLI('get', 'my.key');
    expect(mockResolveKey).toHaveBeenCalledWith('my.key');
    expect(mockGetEntry).toHaveBeenCalledWith('resolved.key', expect.any(Object));
  });

  it('get without key calls getEntry with undefined', () => {
    loadCLI('get');
    expect(mockGetEntry).toHaveBeenCalledWith(undefined, expect.any(Object));
  });

  it('run command resolves key and calls runCommand', () => {
    mockResolveKey.mockReturnValueOnce('resolved.cmd');
    loadCLI('run', 'my.cmd');
    expect(mockResolveKey).toHaveBeenCalledWith('my.cmd');
    expect(mockRunCommand).toHaveBeenCalledWith('resolved.cmd', expect.any(Object));
  });

  it('find command calls searchEntries with options', () => {
    loadCLI('find', 'myterm', '--keys-only');
    expect(mockSearchEntries).toHaveBeenCalledWith('myterm', expect.objectContaining({ keysOnly: true }));
  });

  it('remove command resolves key via resolveKey before calling removeEntry', () => {
    mockResolveKey.mockReturnValueOnce('resolved.key');
    loadCLI('remove', 'my.key');
    expect(mockResolveKey).toHaveBeenCalledWith('my.key');
    expect(mockRemoveEntry).toHaveBeenCalledWith('resolved.key');
  });

  // --- Alias commands ---

  it('alias set calls setAlias with joined args', () => {
    loadCLI('alias', 'set', 'myalias', 'my.path');
    expect(mockSetAlias).toHaveBeenCalledWith('myalias', 'my.path');
  });

  it('alias remove calls removeAlias', () => {
    loadCLI('alias', 'remove', 'myalias');
    expect(mockRemoveAlias).toHaveBeenCalledWith('myalias');
  });

  it('alias get calls displayAliases with all aliases', () => {
    mockLoadAliases.mockReturnValueOnce({ srv: 'server.ip' });
    loadCLI('alias', 'get');
    expect(mockDisplayAliases).toHaveBeenCalledWith(
      { srv: 'server.ip' },
      { tree: undefined, name: undefined }
    );
  });

  it('alias get with no aliases calls displayAliases with empty object', () => {
    mockLoadAliases.mockReturnValueOnce({});
    loadCLI('alias', 'get');
    expect(mockDisplayAliases).toHaveBeenCalledWith({}, { tree: undefined, name: undefined });
  });

  it('alias get with specific name passes name to displayAliases', () => {
    mockLoadAliases.mockReturnValueOnce({ myalias: 'some.path' });
    loadCLI('alias', 'get', 'myalias');
    expect(mockDisplayAliases).toHaveBeenCalledWith(
      { myalias: 'some.path' },
      { tree: undefined, name: 'myalias' }
    );
  });

  it('alias get with missing name passes name to displayAliases', () => {
    mockLoadAliases.mockReturnValueOnce({});
    loadCLI('alias', 'get', 'missing');
    expect(mockDisplayAliases).toHaveBeenCalledWith(
      {},
      { tree: undefined, name: 'missing' }
    );
  });

  it('alias get --tree passes tree option to displayAliases', () => {
    mockLoadAliases.mockReturnValueOnce({ srv: 'server.ip' });
    loadCLI('alias', 'get', '--tree');
    expect(mockDisplayAliases).toHaveBeenCalledWith(
      { srv: 'server.ip' },
      { tree: true, name: undefined }
    );
  });

  it('alias get --tree with no aliases passes tree option to displayAliases', () => {
    mockLoadAliases.mockReturnValueOnce({});
    loadCLI('alias', 'get', '--tree');
    expect(mockDisplayAliases).toHaveBeenCalledWith({}, { tree: true, name: undefined });
  });

  it('alias get --tree with specific name passes both options', () => {
    mockLoadAliases.mockReturnValueOnce({ srv: 'server.ip' });
    loadCLI('alias', 'get', '--tree', 'srv');
    expect(mockDisplayAliases).toHaveBeenCalledWith(
      { srv: 'server.ip' },
      { tree: true, name: 'srv' }
    );
  });

  it('alias get --tree with missing name passes both options', () => {
    mockLoadAliases.mockReturnValueOnce({ srv: 'server.ip' });
    loadCLI('alias', 'get', '--tree', 'missing');
    expect(mockDisplayAliases).toHaveBeenCalledWith(
      { srv: 'server.ip' },
      { tree: true, name: 'missing' }
    );
  });

  // --- Config commands ---

  it('config with no subcommand calls handleConfig', () => {
    loadCLI('config');
    expect(mockHandleConfig).toHaveBeenCalled();
  });

  it('config set calls configSet', () => {
    loadCLI('config', 'set', 'theme', 'dark');
    expect(mockConfigSet).toHaveBeenCalledWith('theme', 'dark');
  });

  it('config get calls handleConfig with key', () => {
    loadCLI('config', 'get', 'colors');
    expect(mockHandleConfig).toHaveBeenCalledWith('colors');
  });

  // --- Other commands ---

  it('get --keys-only calls getEntry with keysOnly option', () => {
    loadCLI('get', '--keys-only');
    expect(mockGetEntry).toHaveBeenCalledWith(undefined, expect.objectContaining({ keysOnly: true }));
  });

  it('init calls initializeExampleData', () => {
    loadCLI('init');
    expect(mockInitializeExampleData).toHaveBeenCalled();
  });

  it('examples calls showExamples', () => {
    loadCLI('examples');
    expect(mockShowExamples).toHaveBeenCalled();
  });

  it('export calls exportData', () => {
    loadCLI('export', 'data');
    expect(mockExportData).toHaveBeenCalledWith('data', expect.any(Object));
  });

  it('import calls importData', () => {
    loadCLI('import', 'data', 'file.json');
    expect(mockImportData).toHaveBeenCalledWith('data', 'file.json', expect.any(Object));
  });

  it('reset calls resetData', () => {
    loadCLI('reset', 'data');
    expect(mockResetData).toHaveBeenCalledWith('data', expect.any(Object));
  });

  // --- Completions commands ---

  it('completions bash outputs bash script', () => {
    loadCLI('completions', 'bash');
    expect(mockGenerateBashScript).toHaveBeenCalled();
    expect(process.stdout.write).toHaveBeenCalledWith('bash-script');
  });

  it('completions zsh outputs zsh script', () => {
    loadCLI('completions', 'zsh');
    expect(mockGenerateZshScript).toHaveBeenCalled();
    expect(process.stdout.write).toHaveBeenCalledWith('zsh-script');
  });

  it('completions install calls installCompletions', () => {
    loadCLI('completions', 'install');
    expect(mockInstallCompletions).toHaveBeenCalled();
  });

  // --- Help command ---

  it('no-args shows help', () => {
    loadCLI();
    expect(mockShowHelp).toHaveBeenCalled();
  });
});
