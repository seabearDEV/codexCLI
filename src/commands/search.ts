import { getEntriesFlat } from '../storage';
import { setNestedValue } from '../utils/objectPath';
import { formatKeyValue, displayTree, highlightMatch } from '../formatting';
import { color } from '../formatting';
import { loadAliases, buildKeyToAliasMap } from '../alias';
import { SearchOptions } from '../types';
import { isEncrypted } from '../utils/crypto';

function searchDataEntries(flattenedData: Record<string, string>, lcSearchTerm: string, options: SearchOptions): Record<string, string> {
  const matches: Record<string, string> = {};
  Object.entries(flattenedData).forEach(([key, value]) => {
    const encrypted = isEncrypted(value);
    const keyMatches = key.toLowerCase().includes(lcSearchTerm);
    const valueMatches = !encrypted && typeof value === 'string' && value.toLowerCase().includes(lcSearchTerm);

    if (
      (!options.keysOnly && !options.valuesOnly && (keyMatches || valueMatches)) ||
      (options.keysOnly && keyMatches) ||
      (options.valuesOnly && valueMatches)
    ) {
      matches[key] = encrypted ? '[encrypted]' : value;
    }
  });
  return matches;
}

function searchAliasEntries(aliases: Record<string, string>, lcSearchTerm: string, options: SearchOptions): Record<string, string> {
  const matches: Record<string, string> = {};
  Object.entries(aliases).forEach(([aliasName, targetPath]) => {
    const nameMatches = aliasName.toLowerCase().includes(lcSearchTerm);
    const pathMatches = String(targetPath).toLowerCase().includes(lcSearchTerm);

    if (
      (!options.keysOnly && !options.valuesOnly && (nameMatches || pathMatches)) ||
      (options.keysOnly && nameMatches) ||
      (options.valuesOnly && pathMatches)
    ) {
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
      displayTree(matchesObj, buildKeyToAliasMap(aliases));
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
  const flattenedData = options.aliasesOnly ? {} : getEntriesFlat();

  if (Object.keys(flattenedData).length === 0 && !options.aliasesOnly) {
    console.log('No entries to search in.');
    return;
  }

  const lcSearchTerm = searchTerm.toLowerCase();

  const aliases = loadAliases();
  const dataMatches = options.aliasesOnly ? {} : searchDataEntries(flattenedData, lcSearchTerm, options);
  const aliasMatches = options.entriesOnly ? {} : searchAliasEntries(aliases, lcSearchTerm, options);

  const totalMatches = Object.keys(dataMatches).length + Object.keys(aliasMatches).length;

  if (totalMatches === 0) {
    console.log(`No matches found for '${searchTerm}'.`);
    return;
  }

  console.log(`Found ${totalMatches} matches for '${searchTerm}':`);
  displaySearchResults(dataMatches, aliasMatches, aliases, options, searchTerm);
}
