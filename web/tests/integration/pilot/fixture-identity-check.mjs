import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createFixture } from '../helpers/fixtures.mjs';
import { readState } from '../../../scripts/local-runtime.mjs';
import { mediaEnvironment } from '../../../scripts/media-environment.mjs';
import { pilotRuntimeEnvironment } from '../../../scripts/pilot/runtime-environment.mjs';
import { custodyRoot, writePrivateJson } from '../../../scripts/pilot/custody.mjs';
import { assertSourceWritersAbsent } from '../../../scripts/pilot/backup-source.mjs';
import { privateDiagnostic } from '../../../scripts/pilot/error-diagnostic.mjs';

// Duas identidades sintéticas próprias; nunca reutiliza email/ID de outra fixture.
assert.equal(process.argv.length, 2);
await assertSourceWritersAbsent();
Object.assign(process.env, pilotRuntimeEnvironment(readState('t14'), 'development'), mediaEnvironment('development', 't14'));
const hooks = []; const fixture = await createFixture({ after: hook => hooks.push(hook) }, { target: 'development' });
const run = randomUUID(); let original; let replacement; let originalRemoved = false;
const report = path.join(custodyRoot, 'reports', 'fixture-identity-check.json');
try {
  original = await fixture.createUser();
  const removed = await fixture.auth.auth.admin.deleteUser(original.id); assert.equal(removed.error, null);
  originalRemoved = true; fixture.trackAuthRemoval(original.id);
  const created = await fixture.auth.auth.admin.createUser({ email: original.email, password: `T15!${randomUUID()}`,
    email_confirm: true, app_metadata: { local_fixture: 'meumimo-t15-identity-check', fixture_run: run } });
  assert.equal(created.error, null); replacement = created.data.user;
  assert.ok(replacement?.id && replacement.id !== original.id);
  await assert.rejects(hooks[0](), { message: 'Fixture de desenvolvimento não pode ampliar usuários por e-mail.' });
  const preserved = await fixture.auth.auth.admin.getUserById(replacement.id);
  assert.equal(preserved.error, null); assert.equal(preserved.data.user.id, replacement.id);
  assert.equal(preserved.data.user.email, original.email);
  assert.equal(preserved.data.user.app_metadata.fixture_run, run);
  await writePrivateJson(report, { code: 'FIXTURE_REPLACEMENT_PRESERVED', checkedAt: new Date().toISOString(), counts: { identities: 2, preserved: 1 } });
  process.stdout.write('FIXTURE_REPLACEMENT_PRESERVED\n');
} catch (error) {
  await writePrivateJson(report, { code: 'FIXTURE_IDENTITY_CHECK_FAILED', diagnostic: privateDiagnostic(error) });
  process.stderr.write('FIXTURE_IDENTITY_CHECK_FAILED\n'); process.exitCode = 1;
} finally {
  try {
    if (replacement) {
      const current = await fixture.auth.auth.admin.getUserById(replacement.id);
      if (current.error?.status !== 404) {
        assert.equal(current.error, null); assert.equal(current.data.user.email, original.email);
        assert.equal(current.data.user.app_metadata.local_fixture, 'meumimo-t15-identity-check');
        assert.equal(current.data.user.app_metadata.fixture_run, run);
        assert.equal((await fixture.auth.auth.admin.deleteUser(replacement.id)).error, null);
      }
    }
    if (original && !originalRemoved) {
      const current = await fixture.auth.auth.admin.getUserById(original.id);
      assert.equal(current.error, null); assert.equal(current.data.user.email, original.email);
      assert.equal((await fixture.auth.auth.admin.deleteUser(original.id)).error, null);
    }
  } finally { await fixture.close(); }
}
