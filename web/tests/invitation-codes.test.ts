import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { normalizeInvitationCode, displayInvitationCode } from '../src/lib/invitation-code.ts';

test('código completo aceita caixa e agrupamento sem aproximar caracteres', () => {
  for (const value of ['7kq9m-4tx2p', '  7KQ9M4TX2P  ', '7KQ9M-4TX2P']) {
    assert.equal(normalizeInvitationCode(value), '7KQ9M4TX2P');
    assert.equal(displayInvitationCode(value), '7KQ9M-4TX2P');
  }
  for (const value of ['7KQ9M', '7KQ9M4TX2PZ', '0KQ9M4TX2P', '1KQ9M4TX2P', 'IKQ9M4TX2P',
    'OKQ9M4TX2P', '7K-Q9M4TX2P', '7KQ9M--4TX2P', '7KQ9M 4TX2P', '7KQ9M\u00004TX2P', '\n7KQ9M4TX2P']) {
    assert.equal(normalizeInvitationCode(value), null, value);
  }
});

test('HMAC separa contexto, consulta e política; validação estrita e estado no limite', () => {
  const result = spawnSync(process.execPath, ['--conditions=react-server', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createHmac } from 'node:crypto';
    import { deriveInvitationCode, invitationCodeHash } from './src/server/invitations/code.ts';
    import { parseCodeInvitation, creationDigest } from './src/server/invitations/validation.ts';
    import { codeInvitationStatus } from './src/server/invitations/policy.ts';
    const code = deriveInvitationCode('a', 'b', 'c', 0);
    assert.match(code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/);
    assert.equal(code, deriveInvitationCode('a', 'b', 'c', 0));
    assert.notEqual(code, deriveInvitationCode('a', 'b', 'c', 1));
    assert.notEqual(code, deriveInvitationCode('a', 'b', 'd', 0));
    assert.notEqual(code, deriveInvitationCode('b', 'a', 'c', 0));
    assert.throws(() => deriveInvitationCode('a\\0b', 'c', 'd', 0));
    assert.equal(invitationCodeHash(code), createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET)
      .update('meumimo:invitation-code-lookup:v1\\0').update(code).digest('hex'));
    const body = {operationId:'11111111-1111-4111-8111-111111111111',kind:'CODE',expiration:{kind:'AFTER_DAYS',days:7},maxUses:1};
    const parsed = parseCodeInvitation(body);
    assert.equal(creationDigest(parsed), creationDigest(parseCodeInvitation({...body})));
    assert.notEqual(creationDigest(parsed), creationDigest(parseCodeInvitation({...body,maxUses:null})));
    for (const maxUses of [0, -1, 1.1, true, '1', 1000001, undefined]) assert.throws(() => parseCodeInvitation({...body,maxUses}));
    assert.doesNotThrow(() => parseCodeInvitation({...body,maxUses:null,expiration:{kind:'NEVER'}}));
    assert.throws(() => parseCodeInvitation({...body,extra:true}));
    assert.throws(() => parseCodeInvitation({...body,expiration:{kind:'NEVER',days:7}}));
    assert.throws(() => parseCodeInvitation({...body,expiration:{kind:'AT',at:'2026-11-01T12:00'}}));
    assert.throws(() => parseCodeInvitation({...body,expiration:{kind:'AT',at:'2026-02-30T12:00:00-03:00'}}));
    const now = new Date('2026-10-23T12:00:00Z');
    const row = {expiresAt:now,revokedAt:null,maxUses:1,useCount:0};
    const store = {state:'ACTIVE',platformPausedAt:null};
    assert.equal(codeInvitationStatus(row,store,now),'EXPIRED');
    assert.equal(codeInvitationStatus({...row,expiresAt:null},store,now),'PENDING');
    assert.equal(codeInvitationStatus({...row,expiresAt:null,useCount:1},store,now),'EXHAUSTED');
    assert.equal(codeInvitationStatus({...row,expiresAt:null,maxUses:null,useCount:9},store,now),'PENDING');
    assert.equal(codeInvitationStatus(row,{...store,state:'PAUSED'},now),'PAUSED');
  `], { cwd: new URL('../', import.meta.url), encoding: 'utf8', windowsHide: true, env: {
    ...process.env, APP_ORIGIN: 'http://127.0.0.1:4301', SUPABASE_URL: 'http://127.0.0.1:54321',
    DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:54322/fixture',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', AUTH_RATE_LIMIT_SECRET: 'invitation-unit-fixture-secret-32-chars',
  } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
