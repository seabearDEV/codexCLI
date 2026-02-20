import { handleError, saveData } from '../storage';
import { saveAliases } from '../alias';
import { color } from '../formatting';
import { printSuccess } from './helpers';
import fs from 'fs';
import {
  getDataDirectory,
  ensureDataDirectoryExists,
  getDataFilePath,
  getAliasFilePath,
  getConfigFilePath
} from '../utils/paths';
import { atomicWriteFileSync } from '../utils/atomicWrite';

export function getExampleData(): import('../types').CodexData {
  return {
    "snippets": {
      "welcome": {
        "content": "Welcome to CodexCLI! This is a sample snippet to get you started.",
        "created": new Date().toISOString()
      },
      "example": {
        "content": "This is an example showing how to structure your snippets.",
        "created": new Date().toISOString()
      },
      "git-push": {
        "content": "git push origin $(git branch --show-current)",
        "description": "Push to the current branch"
      },
      "docker-clean": {
        "content": "docker system prune -af --volumes",
        "description": "Clean all unused Docker resources"
      }
    },
    "paths": {
      "github": "/Users/user/Projects/github.com",
      "codexcli": "cd ${paths.github}/codexCLI"
    },
    "server": {
      "production": {
        "ip": "192.168.1.100",
        "user": "admin",
        "port": "22",
        "domain": "prod.example.com"
      },
      "staging": {
        "ip": "192.168.1.200",
        "user": "testuser",
        "port": "22",
        "domain": "staging.example.com"
      },
      "development": {
        "ip": "127.0.0.1",
        "user": "devuser",
        "port": "3000"
      }
    },
    "personal": {
      "info": {
        "firstName": "John",
        "lastName": "Doe"
      },
      "contact": {
        "email": "john@example.com",
        "phone": "555-123-4567"
      }
    }
  };
}

export function getExampleAliases(): Record<string, string> {
  return {
    "prodip": "server.production.ip",
    "produser": "server.production.user",
    "prodport": "server.production.port",
    "proddomain": "server.production.domain",
    "stageip": "server.staging.ip",
    "devip": "server.development.ip",
    "welcome": "snippets.welcome.content",
    "gitpush": "snippets.git-push.content",
    "dockerclean": "snippets.docker-clean.content",
    "codexcli": "paths.codexcli",
    "allsnippets": "snippets",
    "allservers": "server"
  };
}

export function getExampleConfig(): Record<string, unknown> {
  return {
    "colors": true,
    "theme": "default"
  };
}

export function initializeExampleData(force: boolean = false): void {
  try {
    const dataDir = getDataDirectory();
    fs.mkdirSync(dataDir, { recursive: true });
    const dataFilePath = getDataFilePath();
    const aliasFilePath = getAliasFilePath();
    const configFilePath = getConfigFilePath();

    console.log('Initializing example data...');
    console.log(`Data directory: ${dataDir}`);
    console.log(`Data file path: ${dataFilePath}`);
    console.log(`Alias file path: ${aliasFilePath}`);
    console.log(`Config file path: ${configFilePath}`);

    const dataExists = fs.existsSync(dataFilePath);
    const aliasesExist = fs.existsSync(aliasFilePath);
    const configExists = fs.existsSync(configFilePath);

    if (dataExists || aliasesExist || configExists) {
      if (!force) {
        console.log(color.yellow('\n⚠ Data or alias files already exist.'));
        console.log(`Data file (${dataFilePath}): ${dataExists ? color.green('exists') : color.red('missing')}`);
        console.log(`Aliases file (${aliasFilePath}): ${aliasesExist ? color.green('exists') : color.red('missing')}`);
        console.log(`Config file (${configFilePath}): ${configExists ? color.green('exists') : color.red('missing')}`);
        console.log('\nUse --force to overwrite existing files.');
        return;
      }
      console.log(color.yellow('\n⚠ Force flag detected. Overwriting existing files...'));
    }

    ensureDataDirectoryExists();

    try {
      saveData(getExampleData());
      saveAliases(getExampleAliases());
      atomicWriteFileSync(configFilePath, JSON.stringify(getExampleConfig(), null, 2));

      printSuccess('Data initialized');
      printSuccess('Aliases initialized');
      printSuccess(`Config file created: ${configFilePath}`);
    } catch (error) {
      handleError('Failed to write files:', error);
      return;
    }

    console.log(color.green('\n✨ Example data successfully initialized!\n'));

    console.log(color.bold('Try these commands:'));
    console.log(`  ${color.yellow('ccli')} ${color.green('get')} ${color.yellow('--tree')}`);
    console.log(`  ${color.yellow('ccli')} ${color.green('get')} ${color.cyan('prodip')}`);
    console.log(`  ${color.yellow('ccli')} ${color.green('alias')} ${color.green('get')}\n`);
  } catch (error) {
    handleError('Error initializing example data:', error);
  }
}
