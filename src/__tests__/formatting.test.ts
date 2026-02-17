import { formatTree, showHelp, displayTree, formatKeyValue, colorizePathByLevels, color, isColorEnabled } from '../formatting';

// Mock config to avoid file-system dependency
jest.mock('../config', () => ({
  loadConfig: jest.fn(() => ({ colors: false, theme: 'default' })),
}));

// Mock fs so path utilities don't touch the real filesystem
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue('{}'),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

describe('formatTree', () => {
  it('renders a simple nested object', () => {
    const data = {
      server: {
        ip: '1.2.3.4',
        port: '22',
      },
    };

    const output = formatTree(data, {}, '', '', false);

    expect(output).toContain('server');
    expect(output).toContain('ip: 1.2.3.4');
    expect(output).toContain('port: 22');
    // Tree connectors
    expect(output).toContain('└──');
    expect(output).toContain('├──');
  });

  it('returns empty string for an empty object', () => {
    const output = formatTree({}, {}, '', '', false);
    expect(output).toBe('');
  });

  it('includes alias annotations when provided', () => {
    const data = { server: { ip: '1.2.3.4' } };
    const aliasMap = { 'server.ip': ['myip'] };

    const output = formatTree(data, aliasMap, '', '', false);

    expect(output).toContain('(myip)');
  });

  it('handles deeply nested structures', () => {
    const data = { a: { b: { c: 'leaf' } } };
    const output = formatTree(data, {}, '', '', false);

    expect(output).toContain('a');
    expect(output).toContain('b');
    expect(output).toContain('c: leaf');
  });
});

describe('showHelp', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('outputs all section headers', () => {
    showHelp();
    const output = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('USAGE:');
    expect(output).toContain('COMMANDS:');
    expect(output).toContain('SHORTCUTS:');
    expect(output).toContain('OPTIONS:');
    expect(output).toContain('EXAMPLES:');
    expect(output).toContain('DATA STORAGE:');
  });

  it('includes storage path references', () => {
    showHelp();
    const output = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Entries are stored in:');
    expect(output).toContain('Aliases are stored in:');
    expect(output).toContain('Config is stored in:');
  });
});

describe('displayTree', () => {
  it('prints formatted tree to console', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    displayTree({ a: { b: 'value' } });
    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain('a');
    expect(output).toContain('b: value');
    consoleSpy.mockRestore();
  });
});

describe('color functions when disabled', () => {
  it('returns unmodified text for all color.* functions', () => {
    const text = 'test string';
    expect(color.cyan(text)).toBe(text);
    expect(color.green(text)).toBe(text);
    expect(color.yellow(text)).toBe(text);
    expect(color.red(text)).toBe(text);
    expect(color.blue(text)).toBe(text);
    expect(color.magenta(text)).toBe(text);
    expect(color.gray(text)).toBe(text);
    expect(color.white(text)).toBe(text);
    expect(color.italic(text)).toBe(text);
    expect(color.bold(text)).toBe(text);
  });

  it('returns unmodified text for all color.boldColors.* functions', () => {
    const text = 'test string';
    expect(color.boldColors.cyan(text)).toBe(text);
    expect(color.boldColors.green(text)).toBe(text);
    expect(color.boldColors.yellow(text)).toBe(text);
    expect(color.boldColors.blue(text)).toBe(text);
    expect(color.boldColors.magenta(text)).toBe(text);
  });

  it('returns plain text from colorizePathByLevels', () => {
    expect(colorizePathByLevels('a.b.c')).toBe('a.b.c');
    expect(colorizePathByLevels('single')).toBe('single');
  });
});

describe('formatKeyValue', () => {
  it('logs key and value to console', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    formatKeyValue('server.ip', '192.168.1.1');
    expect(consoleSpy).toHaveBeenCalledWith('server.ip: 192.168.1.1');
    consoleSpy.mockRestore();
  });
});

describe('color functions when enabled', () => {
  const { loadConfig } = require('../config');

  beforeEach(() => {
    (loadConfig as jest.Mock).mockReturnValue({ colors: true, theme: 'default' });
  });

  afterEach(() => {
    (loadConfig as jest.Mock).mockReturnValue({ colors: false, theme: 'default' });
  });

  it('exercises the color-enabled branch for all color functions', () => {
    // Verify isColorEnabled returns true so the truthy ternary branch is taken
    expect(isColorEnabled()).toBe(true);

    // Calling each function exercises the chalk branch for coverage.
    // Chalk may not emit ANSI codes in non-TTY test env, so we just
    // verify they return strings without asserting on styling.
    expect(typeof color.magenta('test')).toBe('string');
    expect(typeof color.italic('test')).toBe('string');
    expect(typeof color.boldColors.cyan('test')).toBe('string');
    expect(typeof color.boldColors.green('test')).toBe('string');
    expect(typeof color.boldColors.yellow('test')).toBe('string');
    expect(typeof color.boldColors.blue('test')).toBe('string');
    expect(typeof color.boldColors.magenta('test')).toBe('string');
  });
});

describe('showHelp with NODE_ENV=development', () => {
  let consoleSpy: jest.SpyInstance;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('includes [DEV] prefix in data storage paths', () => {
    showHelp();
    const output = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toContain('[DEV]');
  });
});
