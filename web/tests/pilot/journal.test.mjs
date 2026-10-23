import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { validateJournalEntry, verifyJournalInventory, applyJournal } from '../../scripts/pilot/journal.mjs';

const entry = () => ({ database: 'meumimo_t14', protocolId: randomUUID(), subjectProfileId: randomUUID(),
  operatorProfileId: randomUUID(), requestDigest: 'a'.repeat(64),
  verifiedAt: '2026-10-23T10:00:00.000Z', createdAt: '2026-10-23T10:00:01.000Z' });

test('journal aceita somente intenção mínima identificada e sem conteúdo privado', () => {
  const value = entry(); assert.deepEqual(validateJournalEntry(value), value);
  for (const change of [{ database: 'postgres' }, { subjectProfileId: 'invalid' }, { requestDigest: 'token' },
    { text: 'não deve estar no journal' }, { verifiedAt: '2026-10-24T10:00:00.000Z' }, { createdAt: 'ontem' }]) {
    assert.throws(() => validateJournalEntry({ ...value, ...change }));
  }
});

test('reaplicação recusa conexão de origem antes de consultar ou alterar dados', async () => {
  const client = { connectionParameters: { host: '127.0.0.1', port: 54322 }, query: () => assert.fail('origem não pode ser consultada') };
  await assert.rejects(applyJournal({ client, database: 'meumimo_t14', entries: [entry()], mode: 'restore' }));
});

test('checkpoint autentica o inventário e recusa perda de intenção posterior ao backup', () => {
  const value = validateJournalEntry(entry());
  const checkpoint = { formatVersion: 1, generation: randomUUID(), entries: [{ protocolId: value.protocolId,
    sha256: createHash('sha256').update(JSON.stringify(value)).digest('hex') }] };
  assert.deepEqual(verifyJournalInventory(checkpoint, [value]), [value]);
  assert.throws(() => verifyJournalInventory(checkpoint, []));
  assert.throws(() => verifyJournalInventory(checkpoint, [{ ...value, operatorProfileId: randomUUID() }]));
  assert.throws(() => verifyJournalInventory(undefined, []));
});
