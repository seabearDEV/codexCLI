import fs from 'fs';
import os from 'os';
import path from 'path';
import { version } from '../../package.json';
import { getEntriesFlat } from '../storage';
import { loadAliases } from '../alias';
import { loadConfirmKeys } from '../confirm';
import { getDataFilePath, getAliasFilePath, getConfigFilePath, getConfirmFilePath } from '../utils/paths';
import { color } from '../formatting';

export function showInfo(): void {
  const entryCount = Object.keys(getEntriesFlat()).length;
  const aliasCount = Object.keys(loadAliases()).length;
  const confirmCount = Object.keys(loadConfirmKeys()).length;

  console.log();

  const label = (name: string, value: string) => {
    const pad = ' '.repeat(Math.max(2, 18 - name.length));
    console.log(`  ${color.gray(name + ':')}${pad}${value}`);
  };

  label('Version', color.cyan(version));
  label('Entries', String(entryCount));
  label('Aliases', String(aliasCount));
  label('Confirm keys', String(confirmCount));

  console.log();

  label('Entries', getDataFilePath());
  label('Aliases', getAliasFilePath());
  label('Confirm', getConfirmFilePath());
  label('Config', getConfigFilePath());

  console.log();

  const shell = process.env.SHELL ?? '';
  let rcFile: string | null = null;
  const home = os.homedir();
  if (shell.endsWith('/zsh')) {
    rcFile = path.join(home, '.zshrc');
  } else if (shell.endsWith('/bash')) {
    const bashProfile = path.join(home, '.bash_profile');
    const bashrc = path.join(home, '.bashrc');
    rcFile = process.platform === 'darwin' && fs.existsSync(bashProfile) ? bashProfile : bashrc;
  }
  if (rcFile && fs.existsSync(rcFile) && fs.readFileSync(rcFile, 'utf8').includes('ccli completions')) {
    label('Completions', `${color.green('installed')} (${rcFile})`);
  } else {
    label('Completions', `${color.yellow('not installed')} (run: ccli config completions install)`);
  }

  console.log();
}
