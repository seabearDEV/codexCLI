import { filterEntriesByTier, ESSENTIAL_PREFIXES, STANDARD_EXCLUDE_PREFIXES } from '../commands/context';

describe('filterEntriesByTier', () => {
  const flat: Record<string, string> = {
    'project.name': 'test',
    'project.stack': 'Node.js',
    'commands.build': 'npm run build',
    'conventions.tests': 'Vitest',
    'arch.storage': 'Unified data.json',
    'arch.mcp': 'MCP SDK',
    'files.entry': 'src/index.ts',
    'context.ci': 'GitHub Actions',
    'deps.express': 'Express',
  };

  it('full tier returns all entries', () => {
    const result = filterEntriesByTier(flat, 'full');
    expect(Object.keys(result).length).toBe(Object.keys(flat).length);
    expect(result).toEqual(flat);
  });

  it('essential tier returns only project/commands/conventions', () => {
    const result = filterEntriesByTier(flat, 'essential');
    expect(Object.keys(result).length).toBe(4);
    expect(result['project.name']).toBe('test');
    expect(result['commands.build']).toBe('npm run build');
    expect(result['conventions.tests']).toBe('Vitest');
    expect(result['arch.storage']).toBeUndefined();
    expect(result['files.entry']).toBeUndefined();
  });

  it('standard tier excludes arch.*', () => {
    const result = filterEntriesByTier(flat, 'standard');
    expect(result['arch.storage']).toBeUndefined();
    expect(result['arch.mcp']).toBeUndefined();
    // Everything else is included
    expect(result['project.name']).toBe('test');
    expect(result['files.entry']).toBe('src/index.ts');
    expect(result['deps.express']).toBe('Express');
    expect(Object.keys(result).length).toBe(7);
  });

  it('handles empty input', () => {
    expect(filterEntriesByTier({}, 'full')).toEqual({});
    expect(filterEntriesByTier({}, 'essential')).toEqual({});
    expect(filterEntriesByTier({}, 'standard')).toEqual({});
  });

  it('essential prefixes are correct', () => {
    expect(ESSENTIAL_PREFIXES).toContain('project.');
    expect(ESSENTIAL_PREFIXES).toContain('commands.');
    expect(ESSENTIAL_PREFIXES).toContain('conventions.');
  });

  it('standard exclude prefixes are correct', () => {
    expect(STANDARD_EXCLUDE_PREFIXES).toContain('arch.');
  });
});
