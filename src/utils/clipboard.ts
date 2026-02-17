import { execSync } from 'child_process';

/**
 * Copy text to the system clipboard using platform-native commands.
 * Throws on unsupported platforms or if the clipboard command fails.
 */
export function copyToClipboard(text: string): void {
  const platform = process.platform;

  let cmd: string;
  if (platform === 'darwin') {
    cmd = 'pbcopy';
  } else if (platform === 'linux') {
    try {
      execSync('which xclip', { stdio: 'ignore' });
      cmd = 'xclip -selection clipboard';
    } catch {
      cmd = 'xsel --clipboard --input';
    }
  } else {
    throw new Error(`Clipboard not supported on platform: ${platform}`);
  }

  execSync(cmd, { input: text });
}
