import { execSync } from 'child_process';
import { copyToClipboard } from '../utils/clipboard';

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

describe('copyToClipboard', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    jest.resetAllMocks();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('uses pbcopy on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    copyToClipboard('hello');

    expect(execSync).toHaveBeenCalledWith('pbcopy', { input: 'hello' });
  });

  it('uses xclip on Linux when available', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    // First call is `which xclip` — succeed
    (execSync as jest.Mock).mockImplementationOnce(() => '/usr/bin/xclip');

    copyToClipboard('hello');

    expect(execSync).toHaveBeenCalledWith('which xclip', { stdio: 'ignore' });
    expect(execSync).toHaveBeenCalledWith('xclip -selection clipboard', { input: 'hello' });
  });

  it('falls back to xsel on Linux when xclip is missing', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    // First call is `which xclip` — fail
    (execSync as jest.Mock).mockImplementationOnce(() => { throw new Error('not found'); });

    copyToClipboard('hello');

    expect(execSync).toHaveBeenCalledWith('xsel --clipboard --input', { input: 'hello' });
  });

  it('throws on unsupported platform', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    expect(() => copyToClipboard('hello')).toThrow('Clipboard not supported on platform: win32');
  });
});
