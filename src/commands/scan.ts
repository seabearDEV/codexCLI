import fs from 'fs';
import path from 'path';

export interface ScaffoldEntry {
  key: string;
  value: string;
}

// ── Known-deps lookup ─────────────────────────────────────────────────

/** Maps package names to concise role descriptions. */
export const KNOWN_DEPS: Record<string, string> = {
  // Frameworks
  express: 'Express — HTTP server framework',
  fastify: 'Fastify — HTTP server framework',
  koa: 'Koa — HTTP middleware framework',
  hono: 'Hono — lightweight web framework',
  'next': 'Next.js — React framework with SSR',
  nuxt: 'Nuxt — Vue framework with SSR',
  svelte: 'SvelteKit — Svelte framework',
  '@sveltejs/kit': 'SvelteKit — Svelte app framework',
  astro: 'Astro — content-focused web framework',
  remix: 'Remix — full-stack React framework',

  // Frontend
  react: 'React — UI component library',
  'react-dom': 'React DOM — browser rendering',
  vue: 'Vue — progressive UI framework',
  angular: 'Angular — application framework',
  '@angular/core': 'Angular — application framework',
  // svelte already listed above via '@sveltejs/kit'
  solid: 'SolidJS — reactive UI library',
  'solid-js': 'SolidJS — reactive UI library',
  htmx: 'htmx — HTML-driven interactivity',

  // State management
  redux: 'Redux — predictable state container',
  zustand: 'Zustand — lightweight state management',
  '@tanstack/react-query': 'TanStack Query — async state management',
  swr: 'SWR — React data fetching',

  // Databases & ORMs
  prisma: 'Prisma — ORM and database toolkit',
  '@prisma/client': 'Prisma client — database access',
  drizzle: 'Drizzle — TypeScript ORM',
  'drizzle-orm': 'Drizzle ORM — TypeScript SQL toolkit',
  sequelize: 'Sequelize — SQL ORM',
  typeorm: 'TypeORM — TypeScript/JavaScript ORM',
  mongoose: 'Mongoose — MongoDB ODM',
  knex: 'Knex — SQL query builder',
  pg: 'pg — PostgreSQL client',
  mysql2: 'mysql2 — MySQL client',
  redis: 'Redis — in-memory data store client',
  ioredis: 'ioredis — Redis client',
  better_sqlite3: 'better-sqlite3 — SQLite bindings',
  'better-sqlite3': 'better-sqlite3 — SQLite bindings',

  // Testing
  vitest: 'Vitest — test runner',
  jest: 'Jest — test runner',
  mocha: 'Mocha — test framework',
  chai: 'Chai — assertion library',
  '@testing-library/react': 'React Testing Library — component testing',
  playwright: 'Playwright — browser automation and testing',
  cypress: 'Cypress — E2E testing',
  supertest: 'Supertest — HTTP assertion library',

  // Build tools
  esbuild: 'esbuild — JavaScript bundler',
  vite: 'Vite — dev server and bundler',
  webpack: 'Webpack — module bundler',
  rollup: 'Rollup — ES module bundler',
  tsup: 'tsup — TypeScript bundler',
  turbo: 'Turborepo — monorepo build system',
  '@swc/core': 'SWC — fast Rust-based compiler',

  // Utilities
  zod: 'Zod — runtime schema validation',
  yup: 'Yup — schema validation',
  lodash: 'Lodash — utility library',
  dayjs: 'Day.js — date utility library',
  'date-fns': 'date-fns — date utility library',
  axios: 'Axios — HTTP client',
  chalk: 'chalk — terminal colors',
  commander: 'Commander — CLI framework',
  yargs: 'Yargs — CLI argument parser',
  inquirer: 'Inquirer — interactive CLI prompts',
  dotenv: 'dotenv — environment variable loader',
  winston: 'Winston — logging library',
  pino: 'Pino — fast JSON logger',

  // Auth & security
  jsonwebtoken: 'jsonwebtoken — JWT implementation',
  'next-auth': 'NextAuth.js — authentication',
  passport: 'Passport — authentication middleware',
  bcrypt: 'bcrypt — password hashing',
  helmet: 'Helmet — HTTP security headers',

  // AI / ML
  '@anthropic-ai/sdk': 'Anthropic SDK — Claude API client',
  openai: 'OpenAI SDK — GPT API client',
  langchain: 'LangChain — LLM application framework',
  '@modelcontextprotocol/sdk': 'MCP SDK — Model Context Protocol',

  // Styling
  tailwindcss: 'Tailwind CSS — utility-first CSS',
  'styled-components': 'styled-components — CSS-in-JS',
  '@emotion/react': 'Emotion — CSS-in-JS library',
  sass: 'Sass — CSS preprocessor',
};

// ── Detector: project.* ──────────────────────────────────────────────

export function detectProject(cwd: string): ScaffoldEntry[] {
  const entries: ScaffoldEntry[] = [];

  // Node.js
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      if (typeof pkg.name === 'string') entries.push({ key: 'project.name', value: pkg.name });
      if (typeof pkg.description === 'string') entries.push({ key: 'project.description', value: pkg.description });

      const deps = { ...(pkg.dependencies as Record<string, string> | undefined), ...(pkg.devDependencies as Record<string, string> | undefined) };
      const stack = ['Node.js'];
      if ('typescript' in deps) stack.push('TypeScript');
      if ('react' in deps) stack.push('React');
      if ('vue' in deps) stack.push('Vue');
      if ('next' in deps) stack.push('Next.js');
      if ('express' in deps) stack.push('Express');
      entries.push({ key: 'project.stack', value: stack.join(', ') });
    } catch { /* ignore parse errors */ }
  }

  // Python
  if (fs.existsSync(path.join(cwd, 'pyproject.toml'))) {
    entries.push({ key: 'project.stack', value: 'Python' });
  }

  // Go
  const goModPath = path.join(cwd, 'go.mod');
  if (fs.existsSync(goModPath)) {
    try {
      const goMod = fs.readFileSync(goModPath, 'utf8');
      const moduleLine = /^module\s+(.+)$/m.exec(goMod);
      if (moduleLine) entries.push({ key: 'project.name', value: moduleLine[1] });
    } catch { /* ignore */ }
    entries.push({ key: 'project.stack', value: 'Go' });
  }

  // Rust
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    entries.push({ key: 'project.stack', value: 'Rust' });
  }

  return entries;
}

// ── Detector: commands.* ─────────────────────────────────────────────

export function detectCommands(cwd: string): ScaffoldEntry[] {
  const entries: ScaffoldEntry[] = [];

  // Node.js scripts
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      const scripts = pkg.scripts as Record<string, string> | undefined;
      if (scripts) {
        const scriptMap: Record<string, string> = {
          build: 'commands.build', test: 'commands.test', lint: 'commands.lint',
          dev: 'commands.dev', start: 'commands.start', deploy: 'commands.deploy',
        };
        for (const [script, cmdKey] of Object.entries(scriptMap)) {
          if (scripts[script]) entries.push({ key: cmdKey, value: `npm run ${script}` });
        }
      }
    } catch { /* ignore */ }
  }

  // Python + Makefile
  if (fs.existsSync(path.join(cwd, 'pyproject.toml')) && fs.existsSync(path.join(cwd, 'Makefile'))) {
    entries.push({ key: 'commands.build', value: 'make build' });
    entries.push({ key: 'commands.test', value: 'make test' });
  }

  // Go
  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    entries.push({ key: 'commands.build', value: 'go build ./...' });
    entries.push({ key: 'commands.test', value: 'go test ./...' });
  }

  // Rust
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    entries.push({ key: 'commands.build', value: 'cargo build' });
    entries.push({ key: 'commands.test', value: 'cargo test' });
  }

  return entries;
}

// ── Detector: files.* ────────────────────────────────────────────────

export function detectFiles(cwd: string): ScaffoldEntry[] {
  const entries: ScaffoldEntry[] = [];

  // Entry points
  const entryPoints: [string, string][] = [
    ['src/index.ts', 'TypeScript entry point'],
    ['src/index.js', 'JavaScript entry point'],
    ['src/main.ts', 'TypeScript main entry'],
    ['src/main.js', 'JavaScript main entry'],
    ['src/app.ts', 'Application entry point'],
    ['src/app.js', 'Application entry point'],
    ['src/server.ts', 'Server entry point'],
    ['src/server.js', 'Server entry point'],
    ['index.ts', 'TypeScript entry point'],
    ['index.js', 'JavaScript entry point'],
    ['main.go', 'Go main entry point'],
    ['cmd/main.go', 'Go main entry point'],
    ['src/main.rs', 'Rust main entry point'],
    ['src/lib.rs', 'Rust library entry point'],
    ['main.py', 'Python main entry'],
    ['app.py', 'Python application entry'],
    ['src/main.py', 'Python main entry'],
  ];

  for (const [relPath, desc] of entryPoints) {
    if (fs.existsSync(path.join(cwd, relPath))) {
      entries.push({ key: `files.entry`, value: `${relPath} — ${desc}` });
      break; // only first match
    }
  }

  // Test directories
  const testDirs: [string, string][] = [
    ['src/__tests__', 'src/__tests__/'],
    ['__tests__', '__tests__/'],
    ['tests', 'tests/'],
    ['test', 'test/'],
    ['spec', 'spec/'],
  ];

  for (const [dir, label] of testDirs) {
    if (fs.existsSync(path.join(cwd, dir))) {
      entries.push({ key: 'files.tests', value: `${label} — test directory` });
      break;
    }
  }

  // Config files
  const configs: [string, string, string][] = [
    ['tsconfig.json', 'files.tsconfig', 'tsconfig.json — TypeScript configuration'],
    ['Dockerfile', 'files.docker', 'Dockerfile — container build definition'],
    ['docker-compose.yml', 'files.docker', 'docker-compose.yml — container orchestration'],
    ['docker-compose.yaml', 'files.docker', 'docker-compose.yaml — container orchestration'],
  ];

  for (const [file, key, desc] of configs) {
    if (fs.existsSync(path.join(cwd, file))) {
      entries.push({ key, value: desc });
    }
  }

  // CI
  if (fs.existsSync(path.join(cwd, '.github', 'workflows'))) {
    entries.push({ key: 'files.ci', value: '.github/workflows/ — GitHub Actions CI' });
  } else if (fs.existsSync(path.join(cwd, '.gitlab-ci.yml'))) {
    entries.push({ key: 'files.ci', value: '.gitlab-ci.yml — GitLab CI configuration' });
  } else if (fs.existsSync(path.join(cwd, '.circleci'))) {
    entries.push({ key: 'files.ci', value: '.circleci/ — CircleCI configuration' });
  }

  return entries;
}

// ── Detector: deps.* ─────────────────────────────────────────────────

export function detectDeps(cwd: string): ScaffoldEntry[] {
  const entries: ScaffoldEntry[] = [];

  // Node.js
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      const allDeps = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
      };

      for (const depName of Object.keys(allDeps)) {
        const desc = KNOWN_DEPS[depName];
        if (desc) {
          // Sanitize dep name for dot-notation key (replace @ and / with safe chars)
          const keyName = depName.replace(/^@/, '').replace(/\//g, '-');
          entries.push({ key: `deps.${keyName}`, value: desc });
        }
      }
    } catch { /* ignore */ }
  }

  return entries;
}

// ── Detector: conventions.* ──────────────────────────────────────────

export function detectConventions(cwd: string): ScaffoldEntry[] {
  const entries: ScaffoldEntry[] = [];

  // Test framework
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
      const allDeps = { ...(pkg.dependencies as Record<string, string> | undefined), ...devDeps };

      if ('vitest' in allDeps) entries.push({ key: 'conventions.tests', value: 'Vitest test runner' });
      else if ('jest' in allDeps) entries.push({ key: 'conventions.tests', value: 'Jest test runner' });
      else if ('mocha' in allDeps) entries.push({ key: 'conventions.tests', value: 'Mocha test framework' });

      // Module system
      if (pkg.type === 'module') {
        entries.push({ key: 'conventions.modules', value: 'ESM (type: module in package.json)' });
      } else if (pkg.type === 'commonjs' || !pkg.type) {
        // Only note CJS if there's a package.json (otherwise it's not a Node project)
        entries.push({ key: 'conventions.modules', value: 'CommonJS (default Node.js module system)' });
      }
    } catch { /* ignore */ }
  }

  // Python test framework
  if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'setup.py'))) {
    if (fs.existsSync(path.join(cwd, 'pytest.ini')) || fs.existsSync(path.join(cwd, 'conftest.py'))) {
      entries.push({ key: 'conventions.tests', value: 'pytest test framework' });
    }
  }

  // Linting
  const lintConfigs: [string, string][] = [
    ['eslint.config.js', 'ESLint (flat config)'],
    ['eslint.config.mjs', 'ESLint (flat config)'],
    ['eslint.config.ts', 'ESLint (flat config)'],
    ['.eslintrc.json', 'ESLint'],
    ['.eslintrc.js', 'ESLint'],
    ['.eslintrc.yml', 'ESLint'],
    ['biome.json', 'Biome (linter + formatter)'],
  ];

  for (const [file, desc] of lintConfigs) {
    if (fs.existsSync(path.join(cwd, file))) {
      entries.push({ key: 'conventions.linting', value: desc });
      break;
    }
  }

  // Formatting
  const formatConfigs: [string, string][] = [
    ['.prettierrc', 'Prettier'],
    ['.prettierrc.json', 'Prettier'],
    ['.prettierrc.js', 'Prettier'],
    ['prettier.config.js', 'Prettier'],
    ['prettier.config.mjs', 'Prettier'],
  ];

  for (const [file, desc] of formatConfigs) {
    if (fs.existsSync(path.join(cwd, file))) {
      entries.push({ key: 'conventions.formatting', value: desc });
      break;
    }
  }

  // TypeScript strictness
  const tsconfigPath = path.join(cwd, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    try {
      // Simple JSON parse — tsconfig may have comments, but we try anyway
      const raw = fs.readFileSync(tsconfigPath, 'utf8');
      // Strip single-line comments for basic parsing
      const stripped = raw.replace(/\/\/.*$/gm, '');
      const tsconfig = JSON.parse(stripped) as Record<string, unknown>;
      const compilerOptions = (tsconfig.compilerOptions ?? {}) as Record<string, unknown>;

      const features: string[] = [];
      if (compilerOptions.strict === true) features.push('strict');
      if (compilerOptions.exactOptionalPropertyTypes === true) features.push('exactOptionalPropertyTypes');

      if (features.length > 0) {
        entries.push({ key: 'conventions.types', value: `TypeScript with ${features.join(', ')}` });
      }
    } catch { /* ignore parse errors — tsconfig may have trailing commas, etc. */ }
  }

  return entries;
}

// ── Detector: context.* ──────────────────────────────────────────────

export function detectContext(cwd: string): ScaffoldEntry[] {
  const entries: ScaffoldEntry[] = [];

  // CI provider
  if (fs.existsSync(path.join(cwd, '.github', 'workflows'))) {
    entries.push({ key: 'context.ci', value: 'GitHub Actions (.github/workflows/)' });
  } else if (fs.existsSync(path.join(cwd, '.gitlab-ci.yml'))) {
    entries.push({ key: 'context.ci', value: 'GitLab CI (.gitlab-ci.yml)' });
  } else if (fs.existsSync(path.join(cwd, '.circleci'))) {
    entries.push({ key: 'context.ci', value: 'CircleCI (.circleci/)' });
  }

  // Docker
  if (fs.existsSync(path.join(cwd, 'Dockerfile'))) {
    entries.push({ key: 'context.docker', value: 'Dockerized — Dockerfile present' });
  }

  // Environment files
  if (fs.existsSync(path.join(cwd, '.env.example'))) {
    entries.push({ key: 'context.env', value: '.env.example present — copy to .env for local config' });
  }

  // Monorepo signals
  const monorepoSignals: string[] = [];

  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      if (pkg.workspaces) monorepoSignals.push('npm/yarn workspaces');
    } catch { /* ignore */ }
  }

  if (fs.existsSync(path.join(cwd, 'pnpm-workspace.yaml'))) monorepoSignals.push('pnpm workspaces');
  if (fs.existsSync(path.join(cwd, 'turbo.json'))) monorepoSignals.push('Turborepo');
  if (fs.existsSync(path.join(cwd, 'lerna.json'))) monorepoSignals.push('Lerna');
  if (fs.existsSync(path.join(cwd, 'nx.json'))) monorepoSignals.push('Nx');

  // Also check for common monorepo directory patterns
  if (fs.existsSync(path.join(cwd, 'packages')) || fs.existsSync(path.join(cwd, 'apps'))) {
    if (monorepoSignals.length > 0) {
      // Only declare monorepo if we have a tool signal AND a directory pattern
      entries.push({ key: 'context.monorepo', value: `Monorepo — ${monorepoSignals.join(', ')}` });
    }
  } else if (monorepoSignals.length > 0) {
    entries.push({ key: 'context.monorepo', value: `Monorepo — ${monorepoSignals.join(', ')}` });
  }

  return entries;
}

// ── Main scanner ─────────────────────────────────────────────────────

export function scanCodebase(cwd: string): ScaffoldEntry[] {
  return [
    ...detectProject(cwd),
    ...detectCommands(cwd),
    ...detectFiles(cwd),
    ...detectDeps(cwd),
    ...detectConventions(cwd),
    ...detectContext(cwd),
  ];
}
