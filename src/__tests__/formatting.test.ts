import chalk from 'chalk';
import { formatTree, showHelp, displayTree, formatKeyValue, colorizePathByLevels, color, isColorEnabled, highlightMatch } from '../formatting';
import { loadConfig } from '../config';

// Mock config to avoid file-system dependency
vi.mock('../config', () => ({
  loadConfig: vi.fn(() => ({ colors: false, theme: 'default' })),
}));

// Mock fs so path utilities don't touch the real filesystem
vi.mock('fs', () => {
  const mock = {
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue('{}'),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
  return { default: mock, ...mock };
});

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
  let consoleSpy: SpyInstance;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation();
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
    expect(output).toContain('OPTIONS (set):');
    expect(output).toContain('OPTIONS (get):');
    expect(output).toContain('OPTIONS (run):');
    expect(output).toContain('OPTIONS (find):');
    expect(output).toContain('OPTIONS (global):');
    expect(output).toContain('Show usage examples');
  });

  it('lists the info command', () => {
    showHelp();
    const output = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('info');
    expect(output).toContain('Show version, stats, and storage info');
  });
});

describe('displayTree', () => {
  it('prints formatted tree to console', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation();
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
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation();
    formatKeyValue('server.ip', '192.168.1.1');
    expect(consoleSpy).toHaveBeenCalledWith('server.ip: 192.168.1.1');
    consoleSpy.mockRestore();
  });
});

describe('color functions when enabled', () => {
  beforeEach(() => {
    (loadConfig as Mock).mockReturnValue({ colors: true, theme: 'default' });
  });

  afterEach(() => {
    (loadConfig as Mock).mockReturnValue({ colors: false, theme: 'default' });
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

describe('highlightMatch', () => {
  it('returns text unchanged when colors are disabled', () => {
    expect(highlightMatch('hello world', 'world')).toBe('hello world');
  });

  it('returns text unchanged when term is empty', () => {
    expect(highlightMatch('hello world', '')).toBe('hello world');
  });

  describe('when colors are enabled', () => {
    let originalLevel: typeof chalk.level;

    beforeEach(() => {
      (loadConfig as Mock).mockReturnValue({ colors: true, theme: 'default' });
      originalLevel = chalk.level;
      chalk.level = 1; // Force ANSI color output in non-TTY
    });

    afterEach(() => {
      (loadConfig as Mock).mockReturnValue({ colors: false, theme: 'default' });
      chalk.level = originalLevel;
    });

    it('wraps matched text with ANSI codes', () => {
      const result = highlightMatch('hello world', 'world');
      expect(result).not.toBe('hello world');
      expect(result).toContain('world');
    });

    it('matches case-insensitively and preserves original casing', () => {
      const result = highlightMatch('Hello World', 'hello');
      expect(result).not.toBe('Hello World');
      expect(result).toContain('Hello');
    });

    it('returns text unchanged when there is no match', () => {
      const result = highlightMatch('hello world', 'xyz');
      expect(result).toBe('hello world');
    });

    it('escapes regex special characters in term', () => {
      const result = highlightMatch('price is $100.00', '$100.00');
      expect(result).not.toBe('price is $100.00');
      expect(result).toContain('$100.00');
    });
  });
});

describe('showHelp with NODE_ENV=development', () => {
  let consoleSpy: SpyInstance;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation();
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('still renders without errors in dev mode', () => {
    showHelp();
    expect(consoleSpy).toHaveBeenCalled();
  });
});
