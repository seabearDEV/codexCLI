import * as fs from 'fs';
import { handleError, handleOperation, loadData, saveData, getErrorMessage, clearDataCache } from '../storage';

vi.mock('fs', () => {
  const mock = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    statSync: vi.fn(),
    openSync: vi.fn(() => 3),
    writeSync: vi.fn(),
    closeSync: vi.fn(),
    unlinkSync: vi.fn(),
    constants: { O_CREAT: 0x40, O_EXCL: 0x80, O_WRONLY: 0x01 }
  };
  return { default: mock, ...mock };
});

vi.mock('../formatting', () => ({
  color: {
    red: vi.fn((text: string) => `[red]${text}[/red]`),
    gray: vi.fn((text: string) => `[gray]${text}[/gray]`)
  }
}));

vi.mock('../utils/paths', () => ({
  getDataFilePath: vi.fn(() => '/mock/entries.json')
}));

describe('Storage', () => {
  const originalConsoleError = console.error;
  const originalDebug = process.env.DEBUG;

  beforeEach(() => {
    vi.clearAllMocks();
    clearDataCache();
    console.error = vi.fn();
    delete process.env.DEBUG;
    (fs.statSync as Mock).mockReturnValue({ mtimeMs: 1000 });
  });

  afterEach(() => {
    console.error = originalConsoleError;
    if (originalDebug !== undefined) {
      process.env.DEBUG = originalDebug;
    } else {
      delete process.env.DEBUG;
    }
  });

  describe('handleError', () => {
    it('logs red-colored message in non-DEBUG mode', () => {
      handleError('Something failed', new Error('oops'));

      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith('[red]Something failed[/red]');
    });

    it('in DEBUG mode, logs error object and gray stack trace', () => {
      process.env.DEBUG = '1';
      const err = new Error('oops');

      handleError('Something failed', err);

      expect(console.error).toHaveBeenCalledWith(
        '[red]Something failed[/red]: ',
        err
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[gray]')
      );
    });

    it('includes context prefix when provided', () => {
      handleError('Something failed', new Error('oops'), 'myContext');

      expect(console.error).toHaveBeenCalledWith(
        '[red][myContext] Something failed[/red]'
      );
    });

    it('includes context prefix in DEBUG mode', () => {
      process.env.DEBUG = '1';
      const err = new Error('oops');

      handleError('Something failed', err, 'ctx');

      expect(console.error).toHaveBeenCalledWith(
        '[red][ctx] Something failed[/red]: ',
        err
      );
    });
  });

  describe('handleOperation', () => {
    it('returns result of successful operation', () => {
      const result = handleOperation(() => 42, 'test error');
      expect(result).toBe(42);
    });

    it('returns null and calls handleError when operation throws', () => {
      const result = handleOperation(() => {
        throw new Error('boom');
      }, 'operation failed');

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('operation failed')
      );
    });
  });

  describe('loadData', () => {
    it('returns {} when file does not exist', () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      const data = loadData();
      expect(data).toEqual({});
    });

    it('returns parsed data for valid JSON', () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue(
        JSON.stringify({ server: { ip: '1.2.3.4' } })
      );

      const data = loadData();
      expect(data).toEqual({ server: { ip: '1.2.3.4' } });
    });

    it('returns {} for invalid JSON', () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue('not json');

      const data = loadData();
      expect(data).toEqual({});
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('saveData', () => {
    it('writes formatted JSON via atomic write (tmp + rename)', () => {
      saveData({ key: 'value' });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/mock/entries.json.tmp',
        JSON.stringify({ key: 'value' }, null, 2),
        { encoding: 'utf8', mode: 0o600 }
      );
      expect(fs.renameSync).toHaveBeenCalledWith(
        '/mock/entries.json.tmp',
        '/mock/entries.json'
      );
    });

    it('handles writeFileSync errors gracefully', () => {
      (fs.writeFileSync as Mock).mockImplementationOnce(() => {
        throw new Error('disk error');
      });

      saveData({ key: 'value' });

      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('getErrorMessage', () => {
    it('extracts message from an Error instance', () => {
      expect(getErrorMessage(new Error('oops'))).toBe('oops');
    });

    it('converts a string to itself', () => {
      expect(getErrorMessage('plain string')).toBe('plain string');
    });

    it('converts a number to its string representation', () => {
      expect(getErrorMessage(42)).toBe('42');
    });
  });

  describe('caching', () => {
    it('returns cached data on second call with same mtime', () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue(JSON.stringify({ key: 'value' }));
      (fs.statSync as Mock).mockReturnValue({ mtimeMs: 1000 });

      const first = loadData();
      const second = loadData();

      expect(first).toEqual({ key: 'value' });
      expect(second).toEqual({ key: 'value' });
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('re-reads when mtime changes', () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock)
        .mockReturnValueOnce(JSON.stringify({ key: 'old' }))
        .mockReturnValueOnce(JSON.stringify({ key: 'new' }));
      (fs.statSync as Mock)
        .mockReturnValueOnce({ mtimeMs: 1000 })
        .mockReturnValueOnce({ mtimeMs: 2000 });

      const first = loadData();
      const second = loadData();

      expect(first).toEqual({ key: 'old' });
      expect(second).toEqual({ key: 'new' });
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });

    it('updates cache on saveData (write-through)', () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.statSync as Mock).mockReturnValue({ mtimeMs: 2000 });

      saveData({ saved: 'data' });
      const loaded = loadData();

      expect(loaded).toEqual({ saved: 'data' });
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });
});
