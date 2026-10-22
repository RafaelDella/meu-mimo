import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readState, webRoot } from './local-runtime.mjs';

const action = process.argv[2];
const task = process.argv[3] ?? 't02';
const state = readState(task);
const commands = {
  create: ['migrate', 'dev', '--create-only', '--name', { t02: 'identity_foundation', t04: 'stores_invitations', t05: 'conversations_notifications', t06: 'private_media', t07: 'activities_submissions', t08: 'submission_reviews', t09: 'rewards_redemptions', t10: 'ticket_transitions', t11: 'ticket_albums' }[task]],
  development: ['migrate', 'deploy'],
  integration: ['migrate', 'deploy'],
  status: ['migrate', 'status'],
  diff: ['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--script'],
};
if (!Object.hasOwn(commands, action)) throw new Error('Use create, development, integration, status ou diff.');
const target = ['create', 'development', 'diff'].includes(action) ? state.migration.development : state.migration.integration;
execFileSync(process.execPath, [path.join(webRoot, 'node_modules/prisma/build/index.js'), ...commands[action]], {
  cwd: webRoot, windowsHide: true, stdio: 'inherit', env: {
    ...process.env, MIGRATION_DATABASE_URL: target, SHADOW_DATABASE_URL: state.migration.shadow,
  },
});
