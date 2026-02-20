#!/usr/bin/env node

/**
 * Build a Node SEA (Single Executable Application) binary for the current platform.
 *
 * Usage: node scripts/sea-build.js [output-name]
 *   output-name defaults to ccli-{platform}-{arch} (e.g. ccli-darwin-arm64)
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const platform = os.platform();  // darwin | linux | win32
const arch = os.arch();          // arm64 | x64

// Resolve output binary name
const platformName = platform === 'win32' ? 'win' : platform;
const defaultName = `ccli-${platformName}-${arch}`;
let outputName = process.argv[2] || defaultName;

// Ensure Windows binaries have .exe
if (platform === 'win32' && !outputName.endsWith('.exe')) {
  outputName += '.exe';
}

const BUNDLE   = path.join(DIST, 'ccli-bundle.cjs');
const BLOB     = path.join(DIST, 'sea-prep.blob');
const CONFIG   = path.join(ROOT, 'sea-config.json');
const BINARY   = path.join(DIST, outputName);

function run(cmd, args, opts) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  return execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
}

async function main() {
  // ── 1. esbuild: bundle src/index.ts → dist/ccli-bundle.cjs ───────────────
  console.log('\n=== Step 1: esbuild bundle ===');
  fs.mkdirSync(DIST, { recursive: true });

  const esbuild = require('esbuild');
  const result = esbuild.buildSync({
    entryPoints: [path.join(ROOT, 'src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: BUNDLE,
  });
  if (result.errors.length > 0) {
    console.error('esbuild errors:', result.errors);
    process.exit(1);
  }
  console.log(`Bundled → ${BUNDLE}`);

  // ── 2. Write sea-config.json ──────────────────────────────────────────────
  console.log('\n=== Step 2: SEA config ===');
  const seaConfig = {
    main: BUNDLE,
    output: BLOB,
    disableExperimentalSEAWarning: true,
    useCodeCache: true,
  };
  fs.writeFileSync(CONFIG, JSON.stringify(seaConfig, null, 2));
  console.log(`Wrote ${CONFIG}`);

  // ── 3. Generate blob ──────────────────────────────────────────────────────
  console.log('\n=== Step 3: Generate blob ===');
  run(process.execPath, ['--experimental-sea-config', CONFIG]);

  // ── 4. Copy node binary ───────────────────────────────────────────────────
  console.log('\n=== Step 4: Copy node binary ===');
  fs.copyFileSync(process.execPath, BINARY);
  if (platform !== 'win32') {
    fs.chmodSync(BINARY, 0o755);
  }
  console.log(`Copied ${process.execPath} → ${BINARY}`);

  // ── 5. Inject blob with postject ──────────────────────────────────────────
  console.log('\n=== Step 5: Inject SEA blob ===');

  const { inject } = require('postject');
  const SENTINEL = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

  if (platform === 'darwin') {
    run('codesign', ['--remove-signature', BINARY]);
  }

  await inject(BINARY, 'NODE_SEA_BLOB', fs.readFileSync(BLOB), {
    sentinelFuse: SENTINEL,
    ...(platform === 'darwin' ? { machoSegmentName: 'NODE_SEA' } : {}),
  });
  console.log('Injection done!');

  if (platform === 'darwin') {
    run('codesign', ['--sign', '-', BINARY]);
  }

  // ── 6. Cleanup intermediate files ─────────────────────────────────────────
  console.log('\n=== Step 6: Cleanup ===');
  for (const f of [BUNDLE, BLOB, CONFIG]) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log(`Removed ${path.basename(f)}`);
    }
  }

  console.log(`\nDone! Binary: ${BINARY}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
