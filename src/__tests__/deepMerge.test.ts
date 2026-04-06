import { deepMerge } from '../utils/deepMerge';

describe('deepMerge', () => {
  it('merges flat objects', () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('source overrides target for same key', () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it('deeply merges nested objects', () => {
    const target = { a: { x: 1, y: 2 } };
    const source = { a: { y: 3, z: 4 } };
    expect(deepMerge(target, source)).toEqual({ a: { x: 1, y: 3, z: 4 } });
  });

  it('handles deeply nested merge (3+ levels)', () => {
    const target = { a: { b: { c: { d: 1 } } } };
    const source = { a: { b: { c: { e: 2 } } } };
    expect(deepMerge(target, source)).toEqual({ a: { b: { c: { d: 1, e: 2 } } } });
  });

  it('does not mutate target', () => {
    const target = { a: { x: 1 } };
    const source = { a: { y: 2 } };
    const original = JSON.parse(JSON.stringify(target));
    deepMerge(target, source);
    expect(target).toEqual(original);
  });

  it('does not mutate source', () => {
    const target = { a: { x: 1 } };
    const source = { a: { y: 2 } };
    const original = JSON.parse(JSON.stringify(source));
    deepMerge(target, source);
    expect(source).toEqual(original);
  });

  it('source scalar overrides target object', () => {
    const target = { a: { nested: true } };
    const source = { a: 'flat' };
    expect(deepMerge(target, source)).toEqual({ a: 'flat' });
  });

  it('source object overrides target scalar', () => {
    const target = { a: 'flat' };
    const source = { a: { nested: true } };
    expect(deepMerge(target, source)).toEqual({ a: { nested: true } });
  });

  it('handles empty target', () => {
    expect(deepMerge({}, { a: 1 })).toEqual({ a: 1 });
  });

  it('handles empty source', () => {
    expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
  });

  it('handles both empty', () => {
    expect(deepMerge({}, {})).toEqual({});
  });

  it('handles null values in source', () => {
    expect(deepMerge({ a: 1 }, { a: null })).toEqual({ a: null });
  });

  it('handles array values (no deep merge, just override)', () => {
    const target = { a: [1, 2] };
    const source = { a: [3, 4] };
    const result = deepMerge(target, source);
    expect(result.a).toEqual([3, 4]);
  });

  it('preserves all keys across multiple namespaces', () => {
    const target = { project: { name: 'a' }, commands: { build: 'make' } };
    const source = { project: { desc: 'b' }, arch: { pattern: 'mvc' } };
    const result = deepMerge(target, source);
    expect(result).toEqual({
      project: { name: 'a', desc: 'b' },
      commands: { build: 'make' },
      arch: { pattern: 'mvc' },
    });
  });
});
