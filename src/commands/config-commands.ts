import { color } from '../formatting';
import { loadConfig, getConfigSetting, setConfigSetting } from '../config';
import { printError } from './helpers';
import { debug } from '../utils/debug';

export function handleConfig(setting?: string, value?: string, options?: { list?: boolean }) {
  debug('handleConfig called', { setting, value, options });
  // Handle the --list option
  if (options?.list) {
    console.log();
    console.log(`${color.green('colors'.padEnd(15))}: Enable/disable colored output (true/false)`);
    console.log(`${color.green('theme'.padEnd(15))}: UI theme (default/dark/light)`);
    return;
  }

  // If no setting provided, show all settings
  if (!setting) {
    const config = loadConfig();

    console.log();

    for (const [key, val] of Object.entries(config)) {
      console.log(`${color.green(key.padEnd(15))}: ${val}`);
    }

    console.log('\nUse `ccli config --help` to see available options');
    return;
  }

  // If only setting provided, show that setting's value
  if (setting && !value) {
    const currentValue = getConfigSetting(setting);
    if (currentValue !== null) {
      console.log(`${color.green(setting)}: ${currentValue}`);
    } else {
      printError(`Setting '${color.yellow(setting)}' does not exist`);
    }
    return;
  }

  // If both setting and value provided, update the setting
  setConfigSetting(setting, value!);
  console.log(`Updated ${color.green(setting)} to: ${value}`);
}

export function configSet(setting: string, value: string): void {
  debug('configSet called', { setting, value });
  try {
    const currentValue = getConfigSetting(setting);

    console.log(`Changing ${setting} from ${currentValue} to ${value}`);
    setConfigSetting(setting, value);
    console.log(`${setting} set to ${value}`);
  } catch (error) {
    printError(`Error setting config ${setting}: ${String(error)}`);
  }
}
