import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CLI Integration Tests', () => {
  // Create a temporary directory for test data
  const testDir = path.join(os.tmpdir(), 'codexcli-test-' + Math.random().toString(36).substring(2));
  const execOpts = { env: { ...process.env, CODEX_DATA_DIR: testDir } };

  const run = (args: string) => execSync(`node dist/index.js ${args}`, execOpts).toString();

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('shows help when run without arguments', () => {
    const result = run('');
    expect(result).toContain('ccli');
    expect(result).toContain('COMMANDS');
  });

  it('adds and retrieves an entry', () => {
    run('set --force test.key "test value"');
    const result = run('get test.key');
    expect(result).toContain('test value');
  });

  it('handles search functionality', () => {
    run('set --force search.test.1 "searchable value one"');
    run('set --force search.test.2 "searchable value two"');

    const keyResult = run('find search.test --entries');
    expect(keyResult).toContain('Found 2 matches');
    expect(keyResult).toContain('searchable value one');
    expect(keyResult).toContain('searchable value two');

    const valueResult = run('find "value two" --entries');
    expect(valueResult).not.toContain('search.test.1');
  });

  it('removes entries properly', () => {
    run('set --force remove.test "value to remove"');

    let result = run('get remove.test');
    expect(result).toContain('value to remove');

    run('remove remove.test');

    result = run('get remove.test');
    expect(result).not.toContain('value to remove');
  });
});
