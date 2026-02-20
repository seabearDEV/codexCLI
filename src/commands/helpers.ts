import readline from 'readline';
import { colorizePathByLevels, displayTree } from '../formatting';
import { color } from '../formatting';
import { buildKeyToAliasMap } from '../alias';
import { isEncrypted } from '../utils/crypto';
import { interpretEscapes, visibleLength, wordWrap } from '../utils/wordWrap';

export function printSuccess(message: string): void {
  console.log(color.green('✓ ') + message);
}

export function printError(message: string): void {
  console.error(color.red('✗ ') + message);
}

export function printWarning(message: string): void {
  console.log(color.yellow('⚠ ') + message);
}

export function displayEntries(entries: Record<string, string>, keyToAliasMap?: Record<string, string>): void {
  const aliasMap = keyToAliasMap ?? buildKeyToAliasMap();
  Object.entries(entries).forEach(([key, value]) => {
    const colorizedPath = colorizePathByLevels(key);
    const alias = aliasMap[key];
    const displayed = isEncrypted(value) ? '[encrypted]' : interpretEscapes(value);
    const lines = displayed.split('\n');

    const prefix = alias
      ? `${colorizedPath}: ${color.blue('(' + alias + ')')}`
      : `${colorizedPath}:`;

    const termWidth = process.stdout.columns || 80;

    if (lines.length > 1) {
      console.log(prefix);
      const mlIndent = '  ';
      const mlWidth = termWidth - mlIndent.length;
      for (const line of lines) {
        if (mlWidth < 20) {
          console.log(`${mlIndent}${line}`);
        } else {
          const wrapped = wordWrap(line, mlWidth);
          for (let i = 0; i < wrapped.length; i++) {
            console.log(`${mlIndent}${wrapped[i]}`);
          }
        }
      }
    } else {
      const prefixWidth = visibleLength(prefix) + 1; // +1 for the space
      const valueWidth = termWidth - prefixWidth;
      if (valueWidth < 20) {
        console.log(`${prefix} ${lines[0]}`);
      } else {
        const wrapped = wordWrap(lines[0], valueWidth);
        const indent = ' '.repeat(prefixWidth);
        for (let i = 0; i < wrapped.length; i++) {
          if (i === 0) {
            console.log(`${prefix} ${wrapped[i]}`);
          } else {
            console.log(`${indent}${wrapped[i]}`);
          }
        }
      }
    }
  });
}

export function displayAliases(aliases: Record<string, string>, options?: { tree?: boolean | undefined, name?: string | undefined }): void {
  const name = options?.name;
  const tree = options?.tree;

  if (name) {
    const aliasValue = aliases[name];
    if (!aliasValue) {
      printError(`Alias '${name}' not found`);
      return;
    }
    if (tree) {
      displayTree({ [name]: aliasValue });
    } else {
      console.log(`${color.cyan(name)}: ${colorizePathByLevels(aliasValue)}`);
    }
    return;
  }

  if (Object.keys(aliases).length === 0) {
    console.log('No aliases found. Add one with "ccli alias set <name> <command>"');
    return;
  }

  if (tree) {
    displayTree(aliases as Record<string, unknown>);
  } else {
    Object.entries(aliases).forEach(([alias, path]) => {
      console.log(`${color.cyan(alias)}: ${colorizePathByLevels(path)}`);
    });
  }
}

export function askConfirmation(prompt: string, output?: NodeJS.WritableStream): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: output || process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export function askPassword(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return Promise.reject(new Error('Password input requires an interactive terminal.'));
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    // Write prompt/echo to stderr so it isn't captured by the pager
    const output = process.stderr;

    output.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';

    const onData = (ch: string): void => {
      const c = ch.toString();

      if (c === '\n' || c === '\r' || c === '\u0004') {
        // Enter or Ctrl+D — done
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        output.write('\n');
        resolve(password);
      } else if (c === '\u0003') {
        // Ctrl+C — abort
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        output.write('\n');
        reject(new Error('Password entry cancelled.'));
      } else if (c === '\u007f' || c === '\b') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          output.write('\b \b');
        }
      } else {
        password += c;
        output.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

export const VALID_DATA_TYPES = ['data', 'aliases', 'all'] as const;

export function validateDataType(type: string): boolean {
  return (VALID_DATA_TYPES as readonly string[]).includes(type);
}

export function getInvalidDataTypeMessage(type: string): string {
  return `Invalid type: ${type}. Must be 'data', 'aliases', or 'all'`;
}

export async function confirmOrAbort(prompt: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const answer = await askConfirmation(prompt);
  if (answer.toLowerCase() !== 'y') {
    console.log('Aborted.');
    return false;
  }
  return true;
}
