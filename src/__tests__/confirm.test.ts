import * as fs from 'fs';
import {
  loadConfirmKeys,
  saveConfirmKeys,
  setConfirm,
  removeConfirm,
  hasConfirm,
  removeConfirmForKey,
  buildConfirmSet,
  clearConfirmCache
} from '../confirm';

vi.mock('fs', () => {
  const mock = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn()
  };
  return { default: mock, ...mock };
});

vi.mock('../config', () => ({
  loadConfig: vi.fn(() => ({ colors: true, theme: 'default', backend: 'json' }))
}));

describe('Confirm Metadata', () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeEach(() => {
    vi.resetAllMocks();
    clearConfirmCache();
    console.log = vi.fn();
    console.error = vi.fn();

    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.statSync as Mock).mockReturnValue({ mtimeMs: 1000 });

    const mockConfirm = {
      'commands.deploy': true,
      'commands.rm-logs': true
    };
    (fs.readFileSync as Mock).mockReturnValue(JSON.stringify(mockConfirm));
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe('loadConfirmKeys', () => {
    it('loads confirm keys from file', () => {
      const keys = loadConfirmKeys();

      expect(keys['commands.deploy']).toBe(true);
      expect(keys['commands.rm-logs']).toBe(true);
    });

    it('returns empty object if confirm file does not exist', () => {
      (fs.existsSync as Mock).mockReturnValueOnce(false);

      const keys = loadConfirmKeys();
      expect(Object.keys(keys).length).toBe(0);
    });

    it('handles invalid JSON gracefully', () => {
      (fs.readFileSync as Mock).mockReturnValueOnce('invalid json');

      const keys = loadConfirmKeys();
      expect(Object.keys(keys).length).toBe(0);
      expect(console.error).toHaveBeenCalled();
    });

    it('returns {} for empty file content', () => {
      (fs.readFileSync as Mock).mockReturnValueOnce('');

      const keys = loadConfirmKeys();
      expect(keys).toEqual({});
    });

    it('returns {} silently for SyntaxError with "Unexpected end"', () => {
      (fs.readFileSync as Mock).mockReturnValueOnce('{"key":');

      const keys = loadConfirmKeys();
      expect(keys).toEqual({});
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe('saveConfirmKeys', () => {
    it('writes sorted keys to file', () => {
      saveConfirmKeys({ 'z.key': true, 'a.key': true });

      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedCall = (fs.writeFileSync as Mock).mock.calls[0];
      const saved = JSON.parse(savedCall[1]);
      const sortedKeys = Object.keys(saved);
      expect(sortedKeys).toEqual(['a.key', 'z.key']);
    });

    it('creates directory when it does not exist', () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      saveConfirmKeys({ 'my.key': true });

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('logs error when writeFileSync throws', () => {
      (fs.writeFileSync as Mock).mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      saveConfirmKeys({ 'my.key': true });

      expect(console.error).toHaveBeenCalledWith('Error saving confirm keys:', expect.any(Error));
    });
  });

  describe('setConfirm', () => {
    it('adds a key to confirm set', () => {
      setConfirm('commands.new');

      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedCall = (fs.writeFileSync as Mock).mock.calls[0];
      const saved = JSON.parse(savedCall[1]);
      expect(saved['commands.new']).toBe(true);
      // Existing keys should still be there
      expect(saved['commands.deploy']).toBe(true);
    });
  });

  describe('removeConfirm', () => {
    it('removes a key from confirm set', () => {
      removeConfirm('commands.deploy');

      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedCall = (fs.writeFileSync as Mock).mock.calls[0];
      const saved = JSON.parse(savedCall[1]);
      expect(saved['commands.deploy']).toBeUndefined();
      expect(saved['commands.rm-logs']).toBe(true);
    });

    it('does nothing when key is not in confirm set', () => {
      removeConfirm('nonexistent.key');

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('hasConfirm', () => {
    it('returns true for a key with confirm set', () => {
      expect(hasConfirm('commands.deploy')).toBe(true);
    });

    it('returns false for a key without confirm', () => {
      expect(hasConfirm('commands.greet')).toBe(false);
    });
  });

  describe('removeConfirmForKey', () => {
    it('removes the exact key', () => {
      removeConfirmForKey('commands.deploy');

      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedCall = (fs.writeFileSync as Mock).mock.calls[0];
      const saved = JSON.parse(savedCall[1]);
      expect(saved['commands.deploy']).toBeUndefined();
      expect(saved['commands.rm-logs']).toBe(true);
    });

    it('cascade-deletes children of a parent key', () => {
      removeConfirmForKey('commands');

      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedCall = (fs.writeFileSync as Mock).mock.calls[0];
      const saved = JSON.parse(savedCall[1]);
      expect(Object.keys(saved).length).toBe(0);
    });

    it('does nothing when no matching keys exist', () => {
      removeConfirmForKey('nonexistent');

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('buildConfirmSet', () => {
    it('returns a Set of all confirm keys', () => {
      const set = buildConfirmSet();
      expect(set.has('commands.deploy')).toBe(true);
      expect(set.has('commands.rm-logs')).toBe(true);
      expect(set.has('commands.greet')).toBe(false);
    });
  });

  describe('caching', () => {
    it('returns cached keys on second call with same mtime', () => {
      (fs.statSync as Mock).mockReturnValue({ mtimeMs: 1000 });

      const first = loadConfirmKeys();
      const second = loadConfirmKeys();

      expect(first).toEqual(second);
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('re-reads when mtime changes', () => {
      (fs.statSync as Mock)
        .mockReturnValueOnce({ mtimeMs: 1000 })
        .mockReturnValueOnce({ mtimeMs: 2000 });
      (fs.readFileSync as Mock)
        .mockReturnValueOnce(JSON.stringify({ 'a.key': true }))
        .mockReturnValueOnce(JSON.stringify({ 'b.key': true }));

      const first = loadConfirmKeys();
      const second = loadConfirmKeys();

      expect(first).toEqual({ 'a.key': true });
      expect(second).toEqual({ 'b.key': true });
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });

    it('updates cache on saveConfirmKeys (write-through)', () => {
      (fs.statSync as Mock).mockReturnValue({ mtimeMs: 2000 });

      saveConfirmKeys({ 'saved.key': true });
      const loaded = loadConfirmKeys();

      expect(loaded).toEqual({ 'saved.key': true });
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });
});
