import { handleError, loadData, saveData, getErrorMessage, getValue, setValue, removeValue, getEntriesFlat } from '../storage';

vi.mock('../store', () => ({
  loadEntries: vi.fn(() => ({})),
  saveEntries: vi.fn(),
  loadEntriesMerged: vi.fn(() => ({})),
  clearStoreCaches: vi.fn(),
  findProjectFile: vi.fn(() => null),
  clearProjectFileCache: vi.fn(),
  getEffectiveScope: vi.fn(() => 'global'),
}));

vi.mock('../formatting', () => ({
  color: {
    red: vi.fn((text: string) => `[red]${text}[/red]`),
    gray: vi.fn((text: string) => `[gray]${text}[/gray]`)
  }
}));

import { loadEntries, saveEntries, loadEntriesMerged, clearStoreCaches, findProjectFile } from '../store';

describe('Storage', () => {
  const originalConsoleError = console.error;
  const originalDebug = process.env.DEBUG;

  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
    delete process.env.DEBUG;
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

  describe('loadData', () => {
    it('delegates to loadEntriesMerged for auto scope', () => {
      (loadEntriesMerged as Mock).mockReturnValue({ key: 'value' });

      const result = loadData();
      expect(result).toEqual({ key: 'value' });
      expect(loadEntriesMerged).toHaveBeenCalled();
    });

    it('delegates to loadEntries for explicit scope', () => {
      (loadEntries as Mock).mockReturnValue({ key: 'value' });

      const result = loadData('global');
      expect(result).toEqual({ key: 'value' });
      expect(loadEntries).toHaveBeenCalledWith('global');
    });
  });

  describe('saveData', () => {
    it('delegates to saveEntries', () => {
      saveData({ key: 'value' });
      expect(saveEntries).toHaveBeenCalledWith({ key: 'value' }, undefined);
    });

    it('passes scope through', () => {
      saveData({ key: 'value' }, 'global');
      expect(saveEntries).toHaveBeenCalledWith({ key: 'value' }, 'global');
    });
  });

  describe('getValue', () => {
    it('returns nested value via loadEntries', () => {
      (loadEntries as Mock).mockReturnValue({ server: { ip: '1.2.3.4' } });

      const result = getValue('server.ip', 'global');
      expect(result).toBe('1.2.3.4');
    });

    it('falls through from project to global with auto scope', () => {
      (findProjectFile as Mock).mockReturnValue('/some/.codexcli.json');
      (loadEntries as Mock)
        .mockReturnValueOnce({}) // project: no value
        .mockReturnValueOnce({ server: { ip: '1.2.3.4' } }); // global: has value

      const result = getValue('server.ip');
      expect(result).toBe('1.2.3.4');
    });
  });

});
