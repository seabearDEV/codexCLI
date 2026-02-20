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

const mockGetValue = vi.mocked(getValue);
const mockResolveKey = vi.mocked(resolveKey);

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
