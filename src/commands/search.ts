import { getEntriesFlat } from '../storage';
import { setNestedValue } from '../utils/objectPath';
import { formatKeyValue, displayTree, highlightMatch } from '../formatting';
import { color } from '../formatting';
import { loadAliases, buildKeyToAliasMap } from '../alias';
import { SearchOptions } from '../types';
import { isEncrypted } from '../utils/crypto';
import { debug } from '../utils/debug';
import { interpolate } from '../utils/interpolate';

function searchDataEntries(flattenedData: Record<string, string>, lcSearchTerm: string): Record<string, string> {
  const matches: Record<string, string> = {};
  Object.entries(flattenedData).forEach(([key, value]) => {
    const encrypted = isEncrypted(value);
    let resolved = value;
    if (!encrypted) {
      try { resolved = interpolate(value); } catch { /* use raw */ }
    }
    const keyMatches = key.toLowerCase().includes(lcSearchTerm);
    const valueMatches = !encrypted && resolved.toLowerCase().includes(lcSearchTerm);

    if (keyMatches || valueMatches) {
      matches[key] = encrypted ? '[encrypted]' : resolved;
    }
  });
  return matches;
}

function searchAliasEntries(aliases: Record<string, string>, lcSearchTerm: string): Record<string, string> {
  const matches: Record<string, string> = {};
  Object.entries(aliases).forEach(([aliasName, targetPath]) => {
    const nameMatches = aliasName.toLowerCase().includes(lcSearchTerm);
    const pathMatches = String(targetPath).toLowerCase().includes(lcSearchTerm);

    if (nameMatches || pathMatches) {
      matches[aliasName] = String(targetPath);
    }
  });
  return matches;
}

function displaySearchResults(
  dataMatches: Record<string, string>,
  aliasMatches: Record<string, string>,
  aliases: Record<string, string>,
  options: SearchOptions,
  searchTerm: string
): void {
  const dataMatchKeys = Object.keys(dataMatches);
  const aliasMatchKeys = Object.keys(aliasMatches);
  const hasDataMatches = dataMatchKeys.length > 0;
  const hasAliasMatches = aliasMatchKeys.length > 0;

  if (hasDataMatches) {
    console.log(`\nData entries (${dataMatchKeys.length}):`);

    if (options.tree) {
      const matchesObj = {};
      dataMatchKeys.forEach(key => {
        setNestedValue(matchesObj, key, dataMatches[key]);
      });
      displayTree(matchesObj, buildKeyToAliasMap(aliases), '', '', false, searchTerm);
    } else {
      Object.entries(dataMatches).forEach(([key, value]) => {
        formatKeyValue(key, value, searchTerm);
      });
    }
  }

  if (hasAliasMatches) {
    console.log(`\nAliases (${aliasMatchKeys.length}):`);

    Object.entries(aliasMatches).forEach(([aliasName, targetPath]) => {
      const highlightedName = highlightMatch(aliasName, searchTerm);
      const highlightedPath = highlightMatch(targetPath, searchTerm);
      console.log(`${color.cyan(highlightedName)} ${color.gray('->')} ${color.yellow(highlightedPath)}`);
    });
  }
}

export function searchEntries(searchTerm: string, options: SearchOptions = {}): void {
  debug('searchEntries called', { searchTerm, options });
  const flattenedData = options.aliases ? {} : getEntriesFlat();

  if (Object.keys(flattenedData).length === 0 && !options.aliases) {
    console.log('No entries to search in.');
    return;
  }

  const lcSearchTerm = searchTerm.toLowerCase();

  const aliases = loadAliases();
  const dataMatches = options.aliases ? {} : searchDataEntries(flattenedData, lcSearchTerm);
  const aliasMatches = options.entries ? {} : searchAliasEntries(aliases, lcSearchTerm);

  const totalMatches = Object.keys(dataMatches).length + Object.keys(aliasMatches).length;

  if (totalMatches === 0) {
    console.log(`No matches found for '${searchTerm}'.`);
    return;
  }

  console.log(`Found ${totalMatches} matches for '${searchTerm}':`);
  displaySearchResults(dataMatches, aliasMatches, aliases, options, searchTerm);
}
