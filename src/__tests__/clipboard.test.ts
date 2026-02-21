import { execSync } from 'child_process';
import { copyToClipboard } from '../utils/clipboard';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('copyToClipboard', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    vi.resetAllMocks();
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
    (execSync as Mock).mockImplementationOnce(() => '/usr/bin/xclip');

    copyToClipboard('hello');

    expect(execSync).toHaveBeenCalledWith('which xclip', { stdio: 'ignore' });
    expect(execSync).toHaveBeenCalledWith('xclip -selection clipboard', { input: 'hello' });
  });

  it('falls back to xsel on Linux when xclip is missing', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    // First call is `which xclip` — fail
    (execSync as Mock).mockImplementationOnce(() => { throw new Error('not found'); });

    copyToClipboard('hello');

    expect(execSync).toHaveBeenCalledWith('xsel --clipboard --input', { input: 'hello' });
  });

  it('uses clip on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    copyToClipboard('hello');

    expect(execSync).toHaveBeenCalledWith('clip', { input: 'hello' });
  });

  it('throws on unsupported platform', () => {
    Object.defineProperty(process, 'platform', { value: 'freebsd' });

    expect(() => copyToClipboard('hello')).toThrow('Clipboard not supported on platform: freebsd');
  });
});
