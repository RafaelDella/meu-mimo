import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLocalDatabase } from '../scripts/local-runtime.mjs';

test('comandos de banco aceitam somente destinos locais reservados sem overrides do driver', () => {
  assert.doesNotThrow(() => assertLocalDatabase('postgresql://u:p@127.0.0.1:54322/postgres', 'postgres'));
  assert.doesNotThrow(() => assertLocalDatabase('postgresql://u:p@localhost:54322/meumimo_t02_dev?schema=app', 'meumimo_t02_dev'));
  for (const value of [
    'postgresql://u:p@example.invalid:54322/postgres',
    'postgresql://u:p@127.0.0.1:54322/outro',
    'postgresql://u:p@127.0.0.1:54322/postgres?host=example.invalid&port=5432',
    'postgresql://u:p@127.0.0.1:54322/postgres?schema=app&hostaddr=192.0.2.1',
    'postgresql://u:p@127.0.0.1:54322/postgres?options=-csearch_path%3Dpublic',
    'postgresql://u:p@127.0.0.1:54322/postgres?schema=public',
  ]) assert.throws(() => assertLocalDatabase(value, 'postgres'), /somente o banco local/);
});
