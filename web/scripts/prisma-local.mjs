import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readState, webRoot } from './local-runtime.mjs';

const action = process.argv[2];
const state = readState();
const commands = {
  create: ['migrate', 'dev', '--create-only', '--name', 'identity_foundation'],
  development: ['migrate', 'deploy'],
  integration: ['migrate', 'deploy'],
  status: ['migrate', 'status'],
};
if (!Object.hasOwn(commands, action)) throw new Error('Use create, development, integration ou status.');
const target = ['create', 'development'].includes(action) ? state.migration.development : state.migration.integration;
execFileSync(process.execPath, [path.join(webRoot, 'node_modules/prisma/build/index.js'), ...commands[action]], {
  cwd: webRoot, windowsHide: true, stdio: 'inherit', env: {
    ...process.env, MIGRATION_DATABASE_URL: target, SHADOW_DATABASE_URL: state.migration.shadow,
  },
});
