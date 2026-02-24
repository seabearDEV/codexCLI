import { execSync } from 'child_process';
import { interpolate, interpolateObject } from '../utils/interpolate';
import { getValue } from '../storage';
import { resolveKey } from '../alias';

// Mock storage and alias modules
vi.mock('../storage', () => ({
  getValue: vi.fn(),
  loadData: vi.fn(() => ({})),
}));

vi.mock('../alias', () => ({
  resolveKey: vi.fn((key: string) => key),
  loadAliases: vi.fn(() => ({})),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const mockGetValue = vi.mocked(getValue);
const mockResolveKey = vi.mocked(resolveKey);
const mockExecSync = vi.mocked(execSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveKey.mockImplementation((key: string) => key);
});

describe('interpolate', () => {
  it('returns plain strings unchanged', () => {
    expect(interpolate('hello world')).toBe('hello world');
  });

  it('resolves a single ${key} reference', () => {
    mockGetValue.mockReturnValueOnce('/home/user');
    expect(interpolate('cd ${paths.home}')).toBe('cd /home/user');
    expect(mockGetValue).toHaveBeenCalledWith('paths.home');
  });

  it('resolves multiple references in one string', () => {
    mockGetValue.mockImplementation((key: string) => {
      if (key === 'a') return 'hello';
      if (key === 'b') return 'world';
      return undefined;
    });
    expect(interpolate('${a} and ${b}')).toBe('hello and world');
  });

  it('resolves aliases via resolveKey', () => {
    mockResolveKey.mockImplementation((key: string) => {
      if (key === 'myalias') return 'actual.key';
      return key;
    });
    mockGetValue.mockImplementation((key: string) => {
      if (key === 'actual.key') return 'resolved value';
      return undefined;
    });
    expect(interpolate('${myalias}')).toBe('resolved value');
    expect(mockResolveKey).toHaveBeenCalledWith('myalias');
  });

  it('resolves nested references recursively', () => {
    mockGetValue.mockImplementation((key: string) => {
      if (key === 'a') return '${b}/suffix';
      if (key === 'b') return 'base';
      return undefined;
    });
    expect(interpolate('${a}')).toBe('base/suffix');
  });

  it('throws on circular references', () => {
    mockGetValue.mockImplementation((key: string) => {
      if (key === 'a') return '${b}';
      if (key === 'b') return '${a}';
      return undefined;
    });
    expect(() => interpolate('${a}')).toThrow(/Circular interpolation/);
  });

  it('throws when referenced key is not found', () => {
    mockGetValue.mockReturnValueOnce(undefined);
    expect(() => interpolate('${nonexistent}')).toThrow('Interpolation failed: "nonexistent" not found');
  });

  it('throws when referenced key is not a string (subtree)', () => {
    mockGetValue.mockReturnValueOnce({ nested: 'object' });
    expect(() => interpolate('${subtree}')).toThrow('Interpolation failed: "subtree" is not a string value');
  });

  it('throws when referenced key is encrypted', () => {
    mockGetValue.mockReturnValueOnce('encrypted::v1:abc');
    expect(() => interpolate('${secret}')).toThrow('Interpolation failed: "secret" is encrypted');
  });

  it('leaves $notref and ${unclosed alone', () => {
    expect(interpolate('$notref')).toBe('$notref');
    expect(interpolate('${unclosed')).toBe('${unclosed');
  });

  it('trims whitespace in key references', () => {
    mockGetValue.mockReturnValueOnce('value');
    expect(interpolate('${ key }')).toBe('value');
    expect(mockResolveKey).toHaveBeenCalledWith('key');
  });

  it('throws when depth limit is exceeded', () => {
    // Create a chain that exceeds maxDepth
    mockGetValue.mockImplementation(() => '${next}');
    expect(() => interpolate('${start}', 1)).toThrow(/depth limit exceeded/);
  });
});

describe('interpolateObject', () => {
  it('interpolates leaf string values in a flat object', () => {
    mockGetValue.mockImplementation((key: string) => {
      if (key === 'base') return '/home';
      return undefined;
    });
    const result = interpolateObject({ path: '${base}/docs' });
    expect(result['path']).toBe('/home/docs');
  });

  it('keeps encrypted values as-is', () => {
    const result = interpolateObject({ secret: 'encrypted::v1:abc' });
    expect(result['secret']).toBe('encrypted::v1:abc');
  });

  it('keeps raw value if interpolation fails on a leaf', () => {
    mockGetValue.mockReturnValue(undefined);
    const result = interpolateObject({ path: '${missing}/file' });
    expect(result['path']).toBe('${missing}/file');
  });
});

describe('exec interpolation $(key)', () => {
  it('executes stored command and returns stdout', () => {
    mockGetValue.mockReturnValueOnce('echo hello');
    mockExecSync.mockReturnValueOnce('hello\n');

    expect(interpolate('$(cmd)')).toBe('hello');
    expect(mockExecSync).toHaveBeenCalledWith('echo hello', expect.objectContaining({
      encoding: 'utf-8',
      timeout: 10000,
    }));
  });

  it('caches exec results — same key only executed once', () => {
    mockGetValue.mockImplementation((key: string) => {
      if (key === 'cmd') return 'whoami';
      return undefined;
    });
    mockExecSync.mockReturnValue('kh\n');

    expect(interpolate('$(cmd) and $(cmd)')).toBe('kh and kh');
    expect(mockExecSync).toHaveBeenCalledTimes(1);
  });

  it('interpolates ${} inside stored command before executing', () => {
    mockGetValue.mockImplementation((key: string) => {
      if (key === 'cmd') return 'echo ${name}';
      if (key === 'name') return 'world';
      return undefined;
    });
    mockExecSync.mockReturnValueOnce('world\n');

    expect(interpolate('$(cmd)')).toBe('world');
    expect(mockExecSync).toHaveBeenCalledWith('echo world', expect.anything());
  });

  it('handles mixed ${a} and $(b) in same string', () => {
    mockGetValue.mockImplementation((key: string) => {
      if (key === 'user') return 'kh';
      if (key === 'cmd') return 'echo hi';
      return undefined;
    });
    mockExecSync.mockReturnValueOnce('hi\n');

    expect(interpolate('/Users/${user}/$(cmd)')).toBe('/Users/kh/hi');
  });

  it('throws when exec key is not found', () => {
    mockGetValue.mockReturnValueOnce(undefined);
    expect(() => interpolate('$(missing)')).toThrow('Exec interpolation failed: "missing" not found');
  });

  it('throws when exec key is a subtree (not a string)', () => {
    mockGetValue.mockReturnValueOnce({ nested: 'object' });
    expect(() => interpolate('$(subtree)')).toThrow('Exec interpolation failed: "subtree" is not a string value');
  });

  it('throws when exec key is encrypted', () => {
    mockGetValue.mockReturnValueOnce('encrypted::v1:abc');
    expect(() => interpolate('$(secret)')).toThrow('Exec interpolation failed: "secret" is encrypted');
  });

  it('throws on non-zero exit code', () => {
    mockGetValue.mockReturnValueOnce('exit 42');
    const err: any = new Error('Command failed');
    err.status = 42;
    mockExecSync.mockImplementationOnce(() => { throw err; });

    expect(() => interpolate('$(fail)')).toThrow('Exec interpolation failed: "fail" exited with code 42');
  });

  it('detects circular exec references', () => {
    mockGetValue.mockImplementation((key: string) => {
      if (key === 'a') return '$(a)';
      return undefined;
    });
    expect(() => interpolate('$(a)')).toThrow(/Circular interpolation/);
  });

  it('detects circular cross-type references (${} → $())', () => {
    mockGetValue.mockImplementation((key: string) => {
      if (key === 'a') return '$(b)';
      if (key === 'b') return '${a}';
      return undefined;
    });
    expect(() => interpolate('${a}')).toThrow(/Circular interpolation/);
  });

  it('leaves $(unclosed alone (no closing paren)', () => {
    expect(interpolate('$(unclosed')).toBe('$(unclosed');
  });

  it('trims whitespace in exec key reference', () => {
    mockGetValue.mockReturnValueOnce('echo ok');
    mockExecSync.mockReturnValueOnce('ok\n');

    expect(interpolate('$( cmd )')).toBe('ok');
    expect(mockResolveKey).toHaveBeenCalledWith('cmd');
  });

  it('respects depth limit for exec interpolation', () => {
    mockGetValue.mockImplementation(() => '$(next)');
    expect(() => interpolate('$(start)', 1)).toThrow(/depth limit exceeded/);
  });

  it('returns plain strings without $( unchanged', () => {
    expect(interpolate('no exec here')).toBe('no exec here');
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('shares execCache across interpolateObject leaves', () => {
    mockGetValue.mockImplementation((key: string) => {
      if (key === 'cmd') return 'whoami';
      return undefined;
    });
    mockExecSync.mockReturnValue('kh\n');

    const result = interpolateObject({
      a: '$(cmd)',
      b: '$(cmd)',
    });

    expect(result['a']).toBe('kh');
    expect(result['b']).toBe('kh');
    expect(mockExecSync).toHaveBeenCalledTimes(1);
  });
});
