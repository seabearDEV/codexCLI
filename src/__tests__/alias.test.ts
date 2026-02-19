import * as fs from 'fs';
import {
  setAlias,
  removeAlias,
  renameAlias,
  loadAliases,
  saveAliases,
  buildKeyToAliasMap,
  resolveKey,
  clearAliasCache
} from '../alias';

vi.mock('fs', () => {
  const mock = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn()
  };
  return { default: mock, ...mock };
});

vi.mock('../config', () => ({
  loadConfig: vi.fn(() => ({ colors: true, theme: 'default', backend: 'json' }))
}));

describe('Alias Management', () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  
  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();
    clearAliasCache();
    console.log = vi.fn();
    console.error = vi.fn();

    // Mock existsSync to return true
    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.statSync as Mock).mockReturnValue({ mtimeMs: 1000 });

    // Mock initial aliases
    const mockAliases = {
      'prod-ip': 'server.production.ip',
      'dev-ip': 'server.development.ip'
    };

    // Mock readFileSync to return test aliases
    (fs.readFileSync as Mock).mockReturnValue(JSON.stringify(mockAliases));
  });
  
  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });
  
  describe('loadAliases', () => {
    it('loads aliases from file', () => {
      const aliases = loadAliases();
      
      expect(aliases['prod-ip']).toBe('server.production.ip');
      expect(aliases['dev-ip']).toBe('server.development.ip');
    });
    
    it('returns empty object if aliases file does not exist', () => {
      (fs.existsSync as Mock).mockReturnValueOnce(false);
      
      const aliases = loadAliases();
      expect(Object.keys(aliases).length).toBe(0);
    });
    
    it('handles invalid JSON gracefully', () => {
      (fs.readFileSync as Mock).mockReturnValueOnce('invalid json');
      
      const aliases = loadAliases();
      expect(Object.keys(aliases).length).toBe(0);
      expect(console.error).toHaveBeenCalled();
    });
  });
  
  describe('setAlias', () => {
    it('adds a new alias', () => {
      setAlias('db-uri', 'database.uri');
      
      // Verify write occurred
      expect(fs.writeFileSync).toHaveBeenCalled();
      
      // Get the saved data
      const savedCall = (fs.writeFileSync as Mock).mock.calls[0];
      const savedAliases = JSON.parse(savedCall[1]);
      
      // Verify new alias was added
      expect(savedAliases['db-uri']).toBe('database.uri');
      expect(savedAliases['prod-ip']).toBe('server.production.ip');
    });
    
    it('updates an existing alias', () => {
      setAlias('prod-ip', 'new.path.to.ip');
      
      // Get the saved data
      const savedCall = (fs.writeFileSync as Mock).mock.calls[0];
      const savedAliases = JSON.parse(savedCall[1]);
      
      // Verify alias was updated
      expect(savedAliases['prod-ip']).toBe('new.path.to.ip');
    });
  });
  
  describe('removeAlias', () => {
    it('removes an existing alias', () => {
      removeAlias('prod-ip');
      
      // Verify write occurred
      expect(fs.writeFileSync).toHaveBeenCalled();
      
      // Get the saved data
      const savedCall = (fs.writeFileSync as Mock).mock.calls[0];
      const savedAliases = JSON.parse(savedCall[1]);
      
      // Verify alias was removed
      expect(savedAliases['prod-ip']).toBeUndefined();
      expect(savedAliases['dev-ip']).toBe('server.development.ip');
    });
    
    it('handles non-existent aliases gracefully', () => {
      // First check if the alias exists in the mocked data
      expect(loadAliases()['non-existent']).toBeUndefined();

      // Now attempt to remove it
      removeAlias('non-existent');

      // If removeAlias doesn't log an error, we should modify our expectations
      // Instead of checking console.error, check that writeFileSync wasn't called
      // (since nothing should be written if the alias doesn't exist)
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('renameAlias', () => {
    it('renames an existing alias', () => {
      const result = renameAlias('prod-ip', 'production-ip');

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();

      const savedCall = (fs.writeFileSync as Mock).mock.calls[0];
      const savedAliases = JSON.parse(savedCall[1]);

      expect(savedAliases['production-ip']).toBe('server.production.ip');
      expect(savedAliases['prod-ip']).toBeUndefined();
      expect(savedAliases['dev-ip']).toBe('server.development.ip');
    });

    it('returns false when old name does not exist', () => {
      const result = renameAlias('nonexistent', 'new-name');

      expect(result).toBe(false);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('returns false when new name already exists', () => {
      const result = renameAlias('prod-ip', 'dev-ip');

      expect(result).toBe(false);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('loadAliases - additional branches', () => {
    it('returns {} silently for SyntaxError with "Unexpected end"', () => {
      (fs.readFileSync as Mock).mockReturnValueOnce('{"key":');

      const aliases = loadAliases();
      expect(aliases).toEqual({});
      expect(console.error).not.toHaveBeenCalled();
    });

    it('returns {} for empty file content', () => {
      (fs.readFileSync as Mock).mockReturnValueOnce('');

      const aliases = loadAliases();
      expect(aliases).toEqual({});
    });

    it('returns {} for whitespace-only file content', () => {
      (fs.readFileSync as Mock).mockReturnValueOnce('   \n  ');

      const aliases = loadAliases();
      expect(aliases).toEqual({});
    });
  });

  describe('saveAliases', () => {
    it('creates directory when it does not exist', () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      saveAliases({ myAlias: 'some.path' });

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('logs error when writeFileSync throws', () => {
      (fs.writeFileSync as Mock).mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      saveAliases({ myAlias: 'some.path' });

      expect(console.error).toHaveBeenCalledWith('Error saving aliases:', expect.any(Error));
    });
  });

  describe('buildKeyToAliasMap', () => {
    it('builds inverted map correctly', () => {
      const map = buildKeyToAliasMap();

      expect(map['server.production.ip']).toEqual(['prod-ip']);
      expect(map['server.development.ip']).toEqual(['dev-ip']);
    });

    it('groups multiple aliases sharing a target', () => {
      const multiAliases = {
        'a1': 'target.path',
        'a2': 'target.path',
        'a3': 'other.path'
      };
      (fs.readFileSync as Mock).mockReturnValueOnce(JSON.stringify(multiAliases));

      const map = buildKeyToAliasMap();
      expect(map['target.path']).toEqual(['a1', 'a2']);
      expect(map['other.path']).toEqual(['a3']);
    });

    it('returns empty object when no aliases exist', () => {
      (fs.readFileSync as Mock).mockReturnValueOnce(JSON.stringify({}));

      const map = buildKeyToAliasMap();
      expect(map).toEqual({});
    });
  });

  describe('resolveKey', () => {
    it('returns target path when key is a known alias', () => {
      expect(resolveKey('prod-ip')).toBe('server.production.ip');
    });

    it('returns the key unchanged when it is not an alias', () => {
      expect(resolveKey('unknown-key')).toBe('unknown-key');
    });
  });

  describe('caching', () => {
    it('returns cached aliases on second call with same mtime', () => {
      (fs.statSync as Mock).mockReturnValue({ mtimeMs: 1000 });

      const first = loadAliases();
      const second = loadAliases();

      expect(first).toEqual(second);
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('re-reads when mtime changes', () => {
      (fs.statSync as Mock)
        .mockReturnValueOnce({ mtimeMs: 1000 })
        .mockReturnValueOnce({ mtimeMs: 2000 });
      (fs.readFileSync as Mock)
        .mockReturnValueOnce(JSON.stringify({ a: 'path.a' }))
        .mockReturnValueOnce(JSON.stringify({ b: 'path.b' }));

      const first = loadAliases();
      const second = loadAliases();

      expect(first).toEqual({ a: 'path.a' });
      expect(second).toEqual({ b: 'path.b' });
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });

    it('updates cache on saveAliases (write-through)', () => {
      (fs.statSync as Mock).mockReturnValue({ mtimeMs: 2000 });

      saveAliases({ saved: 'alias.path' });
      const loaded = loadAliases();

      expect(loaded).toEqual({ saved: 'alias.path' });
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });

  describe('buildKeyToAliasMap with preloaded aliases', () => {
    it('uses provided aliases without calling loadAliases', () => {
      const preloaded = { myalias: 'target.path' };
      const map = buildKeyToAliasMap(preloaded);

      expect(map['target.path']).toEqual(['myalias']);
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });
});