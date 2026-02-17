import * as fs from 'fs';
import { loadConfig, saveConfig, getConfigSetting, setConfigSetting, clearConfigCache } from '../config';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  statSync: jest.fn()
}));

jest.mock('../utils/paths', () => ({
  getConfigFilePath: jest.fn(() => '/mock/config.json'),
  ensureDataDirectoryExists: jest.fn()
}));

describe('Config', () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    jest.clearAllMocks();
    clearConfigCache();
    console.error = jest.fn();
    (fs.statSync as jest.Mock).mockReturnValue({ mtimeMs: 1000 });
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  describe('loadConfig', () => {
    it('returns config from valid JSON file', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ colors: false, theme: 'dark' })
      );

      const config = loadConfig();
      expect(config.colors).toBe(false);
      expect(config.theme).toBe('dark');
    });

    it('creates default config when file does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const config = loadConfig();

      expect(config.colors).toBe(true);
      expect(config.theme).toBe('default');
      expect(config.backend).toBe('json');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('returns defaults and logs error for malformed JSON', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('not valid json');

      const config = loadConfig();

      expect(config.colors).toBe(true);
      expect(config.theme).toBe('default');
      expect(console.error).toHaveBeenCalledWith(
        'Error loading configuration:',
        expect.any(SyntaxError)
      );
    });

    it('fills missing fields with defaults', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ colors: false })
      );

      const config = loadConfig();

      expect(config.colors).toBe(false);
      expect(config.theme).toBe('default');
      expect(config.backend).toBe('json');
    });
  });

  describe('saveConfig', () => {
    it('writes formatted JSON to config path', () => {
      saveConfig({ colors: true, theme: 'dark', backend: 'json' });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/mock/config.json',
        JSON.stringify({ colors: true, theme: 'dark', backend: 'json' }, null, 2),
        'utf8'
      );
    });

    it('logs error when writeFileSync throws', () => {
      (fs.writeFileSync as jest.Mock).mockImplementationOnce(() => {
        throw new Error('write failed');
      });

      saveConfig({ colors: true, theme: 'default', backend: 'json' });

      expect(console.error).toHaveBeenCalledWith(
        'Error saving configuration:',
        expect.any(Error)
      );
    });
  });

  describe('getConfigSetting', () => {
    beforeEach(() => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ colors: false, theme: 'dark' })
      );
    });

    it('returns colors value', () => {
      expect(getConfigSetting('colors')).toBe(false);
    });

    it('returns theme value', () => {
      expect(getConfigSetting('theme')).toBe('dark');
    });

    it('returns backend value', () => {
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ colors: true, theme: 'default', backend: 'sqlite' })
      );
      clearConfigCache();
      expect(getConfigSetting('backend')).toBe('sqlite');
    });

    it('returns null and logs error for unknown key', () => {
      const result = getConfigSetting('unknown');

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Unknown configuration key: unknown');
    });
  });

  describe('setConfigSetting', () => {
    beforeEach(() => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ colors: true, theme: 'default' })
      );
    });

    it('sets theme string value', () => {
      setConfigSetting('theme', 'dark');

      const savedCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      const savedConfig = JSON.parse(savedCall[1]);
      expect(savedConfig.theme).toBe('dark');
    });

    it('converts "true" string to boolean for colors', () => {
      setConfigSetting('colors', 'true');

      const savedCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      const savedConfig = JSON.parse(savedCall[1]);
      expect(savedConfig.colors).toBe(true);
    });

    it('converts "false" string to false for colors', () => {
      setConfigSetting('colors', 'false');

      const savedCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      const savedConfig = JSON.parse(savedCall[1]);
      expect(savedConfig.colors).toBe(false);
    });

    it('sets backend to sqlite', () => {
      setConfigSetting('backend', 'sqlite');

      const savedCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      const savedConfig = JSON.parse(savedCall[1]);
      expect(savedConfig.backend).toBe('sqlite');
    });

    it('sets backend to json', () => {
      setConfigSetting('backend', 'json');

      const savedCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      const savedConfig = JSON.parse(savedCall[1]);
      expect(savedConfig.backend).toBe('json');
    });

    it('warns when switching backend without migration', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      // default backend in the mock is 'json', switching to 'sqlite'
      setConfigSetting('backend', 'sqlite');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Run 'ccli migrate sqlite'")
      );
      warnSpy.mockRestore();
    });

    it('does not warn when setting backend to same value', () => {
      // The mock returns config with backend defaulting to 'json'
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      setConfigSetting('backend', 'json');

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('rejects invalid backend value', () => {
      setConfigSetting('backend', 'invalid');

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Invalid backend value: 'invalid'")
      );
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('rejects invalid theme value', () => {
      setConfigSetting('theme', 'neon');

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Invalid theme: 'neon'")
      );
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('accepts all valid theme values', () => {
      for (const theme of ['default', 'dark', 'light']) {
        clearConfigCache();
        jest.clearAllMocks();
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue(
          JSON.stringify({ colors: true, theme: 'default' })
        );
        (fs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() });

        setConfigSetting('theme', theme);

        const savedCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
        const savedConfig = JSON.parse(savedCall[1]);
        expect(savedConfig.theme).toBe(theme);
      }
    });

    it('logs error for unknown key and does not save', () => {
      setConfigSetting('unknown', 'value');

      expect(console.error).toHaveBeenCalledWith('Unknown configuration key: unknown');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('caching', () => {
    it('returns cached config on second call with same mtime', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ colors: false, theme: 'dark' })
      );
      (fs.statSync as jest.Mock).mockReturnValue({ mtimeMs: 1000 });

      const first = loadConfig();
      const second = loadConfig();

      expect(first).toEqual({ colors: false, theme: 'dark', backend: 'json' });
      expect(second).toEqual({ colors: false, theme: 'dark', backend: 'json' });
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('re-reads when mtime changes', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock)
        .mockReturnValueOnce(JSON.stringify({ colors: true, theme: 'default' }))
        .mockReturnValueOnce(JSON.stringify({ colors: false, theme: 'dark' }));
      (fs.statSync as jest.Mock)
        .mockReturnValueOnce({ mtimeMs: 1000 })
        .mockReturnValueOnce({ mtimeMs: 2000 });

      const first = loadConfig();
      const second = loadConfig();

      expect(first.colors).toBe(true);
      expect(second.colors).toBe(false);
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });

    it('updates cache on saveConfig (write-through)', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ mtimeMs: 2000 });

      saveConfig({ colors: false, theme: 'dark', backend: 'json' });
      const loaded = loadConfig();

      expect(loaded).toEqual({ colors: false, theme: 'dark', backend: 'json' });
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });
});
