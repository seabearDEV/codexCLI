import fs from 'fs';
import { getDataDirectory, getAliasFilePath } from './utils/paths';

// Interface for the aliases storage
interface AliasMap {
  [key: string]: string;
}

// Load aliases from storage
export function loadAliases(): AliasMap {
  const aliasPath = getAliasFilePath();
  
  try {
    if (!fs.existsSync(aliasPath)) return {};
    
    const data = fs.readFileSync(aliasPath, 'utf8');
    return data && data.trim() ? JSON.parse(data) : {};
  } catch (error) {
    if (!(error instanceof SyntaxError && error.message.includes('Unexpected end'))) {
      console.error('Error loading aliases:', error);
    }
    return {};
  }
}

// Save aliases to storage
export function saveAliases(aliases: AliasMap): void {
  const aliasPath = getAliasFilePath();
  const dataDir = getDataDirectory();
  
  try {
    // Ensure directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(aliasPath, JSON.stringify(aliases, null, 2));
  } catch (error) {
    console.error('Error saving aliases:', error);
  }
}

// Create or update an alias
export function setAlias(alias: string, path: string): void {
  const aliases = loadAliases();
  aliases[alias] = path;
  saveAliases(aliases);
  console.log(`Alias '${alias}' added successfully.`);
}

// Remove an alias
export function removeAlias(alias: string): boolean {
  const aliases = loadAliases();
  
  if (aliases.hasOwnProperty(alias)) {
    delete aliases[alias];
    saveAliases(aliases);
    return true;
  }
  
  return false;
}

// Resolve a key that might be an alias
export function resolveKey(key: string): string {
  const aliases = loadAliases();
  return aliases[key] || key;
}

// Find all aliases that point to a specific path
export function getAliasesForPath(path: string): string[] {
  const aliases = loadAliases();
  return Object.entries(aliases)
    .filter(([_, targetPath]) => targetPath === path)
    .map(([aliasName]) => aliasName);
}