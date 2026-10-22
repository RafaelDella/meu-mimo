/* global document */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { chromium } from '@playwright/test';
import { mediaFixture, closeRuntime, fileInput, fixtureBytes, processBatch } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
import { signMediaAccess } from '../../../src/server/media/tokens.ts';

const execute = promisify(execFile);
after(closeRuntime);

async function bytesAt(person, url, status = 200, headers) {
  const response = await person.client.get(url, headers); expectStatus(response, status);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-disposition'), /^inline/);
  return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}
async function probe(bytes) {
  const filename = path.join(process.env.T06_MEDIA_FIXTURES, `proof-${randomUUID()}.mp4`);
  await writeFile(filename, bytes, { flag: 'wx', mode: 0o600 });
  try {
    const { stdout } = await execute(process.env.FFPROBE_PATH,
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filename],
      { timeout: 20_000, windowsHide: true, encoding: 'utf8', maxBuffer: 2_000_000 });
    return JSON.parse(stdout);
  } finally { await unlink(filename); }
}

test('mídia: fotos reais aplicam orientação, removem EXIF/GPS e entregam JPEG e miniatura privados', async t => {
  const f = await mediaFixture(t);
  const source = await fixtureBytes('photo-gps-orientation.jpg');
  const original = await sharp(source).metadata();
  assert.equal(original.orientation, 6); assert.ok(original.exif);
  const items = [await f.upload(f.ana, source, 'image/jpeg', f.evidence)];
  for (const [name, mime] of [['photo.png', 'image/png'], ['photo.webp', 'image/webp']]) {
    items.push(await f.upload(f.owner, await fixtureBytes(name), mime));
  }
  assert.deepEqual(await processBatch(), { processed: 3, failed: 0 });
  for (const [index, item] of items.entries()) {
    const person = index === 0 ? f.ana : f.owner;
    const ready = await f.asset(person, item.id);
    assert.equal(ready.state, 'READY'); assert.equal(ready.publishedAt, null);
    const grant = await f.access(person, item.id);
    assert.ok(grant.url.startsWith(`/api/lojas/${f.store.id}/midia/arquivos/${item.id}/conteudo?token=`));
    assert.ok(Date.parse(grant.expiresAt) - Date.now() <= 300_000);
    const display = await bytesAt(person, grant.url);
    assert.equal(display.response.headers.get('content-type'), 'image/jpeg');
    const metadata = await sharp(display.bytes).metadata();
    assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.exif, undefined); assert.equal(metadata.orientation, undefined);
    assert.ok(metadata.width <= 2048 && metadata.height <= 2048);
    if (index === 0) { assert.equal(metadata.height, 2048); assert.ok(metadata.height > metadata.width); }
    const thumbnail = await bytesAt(person, (await f.access(person, item.id, 'thumbnail')).url);
    const small = await sharp(thumbnail.bytes).metadata();
    assert.equal(small.format, 'jpeg'); assert.ok(small.width <= 480 && small.height <= 480); assert.equal(small.exif, undefined);
  }
});

test('mídia: MP4/MOV reais preservam rotação/silêncio e resultam em H264/AAC yuv420p', async t => {
  const f = await mediaFixture(t);
  const scenarios = [
    ['video.mp4', 'video/mp4', true, false], ['video.mov', 'video/quicktime', true, false],
    ['video-silent.mp4', 'video/mp4', false, false], ['video-rotated.mov', 'video/quicktime', true, true],
  ];
  const items = [];
  for (const [name, mime] of scenarios) items.push(await f.upload(f.owner, await fixtureBytes(name), mime));
  assert.deepEqual(await processBatch(), { processed: 4, failed: 0 });
  for (const [index, item] of items.entries()) {
    const ready = await f.asset(f.owner, item.id); assert.equal(ready.state, 'READY');
    assert.ok(ready.durationMs > 0 && ready.durationMs <= 60_200);
    const grant = await f.access(f.owner, item.id);
    const delivered = await bytesAt(f.owner, grant.url);
    assert.equal(delivered.response.headers.get('content-type'), 'video/mp4');
    const metadata = await probe(delivered.bytes);
    const video = metadata.streams.find(stream => stream.codec_type === 'video');
    const audio = metadata.streams.filter(stream => stream.codec_type === 'audio');
    assert.equal(video.codec_name, 'h264'); assert.equal(video.pix_fmt, 'yuv420p');
    assert.ok(Math.max(video.width, video.height) <= 1920 && Math.min(video.width, video.height) <= 1080);
    assert.equal(audio.length, scenarios[index][2] ? 1 : 0);
    if (audio.length) assert.equal(audio[0].codec_name, 'aac');
    if (scenarios[index][3]) assert.ok(video.height > video.width);
    assert.ok(!(video.side_data_list ?? []).some(side => side.rotation && side.rotation % 360 !== 0));
    assert.ok(!Object.keys(metadata.format.tags ?? {}).some(name => /location|gps/i.test(name)));
    const thumb = await bytesAt(f.owner, (await f.access(f.owner, item.id, 'thumbnail')).url);
    assert.equal((await sharp(thumb.bytes).metadata()).format, 'jpeg');
    const range = await bytesAt(f.owner, grant.url, 206, { Range: 'bytes=0-31' });
    assert.equal(range.bytes.length, 32); assert.ok(range.bytes.equals(delivered.bytes.subarray(0, 32)));
    assert.equal(range.response.headers.get('content-range'), `bytes 0-31/${delivered.bytes.length}`);
    await errorCode(await f.owner.client.get(grant.url, { Range: 'bytes=0-1,3-4' }), 416);
    await errorCode(await f.owner.client.get(grant.url, { Range: `bytes=${delivered.bytes.length}-` }), 416);
  }
});

test('mídia: bytes falsos, truncados, pixels excessivos, duração e MIME incoerente falham sem publicar', async t => {
  const f = await mediaFixture(t);
  const photo = await fixtureBytes('photo.png');
  const cases = [
    [Buffer.from('texto não é uma imagem'), 'image/jpeg'], [photo.subarray(0, 20), 'image/png'],
    [photo, 'image/jpeg'], [await fixtureBytes('photo-large.png'), 'image/png'],
    [await fixtureBytes('video-long.mp4'), 'video/mp4'], [await fixtureBytes('video.mp4'), 'video/quicktime'],
  ];
  const items = [];
  for (const [bytes, mime] of cases) items.push(await f.upload(f.owner, bytes, mime));
  assert.deepEqual(await processBatch(), { processed: 0, failed: cases.length });
  for (const item of items) {
    const failed = await f.asset(f.owner, item.id);
    assert.equal(failed.state, 'FAILED'); assert.equal(failed.failureCode, 'file_invalid'); assert.equal(failed.publishedAt, null);
    await errorCode(await f.owner.client.post(`${f.assetPath(item.id)}/acesso`, { variant: 'display' }), 404);
    assert.ok((await f.objectKeys(item.id)).every(key => key.includes('/parts/')));
  }
});

test('mídia: checksum total detecta arquivo divergente mesmo com partes individualmente válidas', async t => {
  const f = await mediaFixture(t);
  const bytes = await fixtureBytes('photo.png');
  const input = { ...fileInput(bytes), sha256: '0'.repeat(64) };
  const [item] = await f.reserve(f.owner, [input]);
  expectStatus(await f.part(f.owner, item.id, bytes), 200);
  expectStatus(await f.owner.client.post(`${f.assetPath(item.id)}/concluir`, {}), 202);
  assert.deepEqual(await processBatch(), { processed: 0, failed: 1 });
  assert.equal((await f.asset(f.owner, item.id)).failureCode, 'file_invalid');
});

test('mídia: token é de sessão/variante, expira e revogação posterior nega GET e Range', async t => {
  const f = await mediaFixture(t);
  const item = await f.upload(f.owner, await fixtureBytes('video.mp4'), 'video/mp4');
  await processBatch(); await f.publish(f.owner, f.memory, [item.id]);
  const grant = await f.access(f.owner, item.id);
  const identity = await f.identity(f.owner);
  const clock = Date.now;
  let expired;
  try {
    Date.now = () => clock() - 300_001;
    expired = signMediaAccess(identity, f.store.id, item.id, 'display').token;
  } finally { Date.now = clock; }
  await errorCode(await f.owner.client.get(`${f.assetPath(item.id)}/conteudo?token=${expired}`), 410, 'media_url_expired');
  await errorCode(await f.ana.client.get(grant.url), 404);
  await errorCode(await f.client().get(grant.url), 401);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt" = now() WHERE id = $1', [f.participation.id]);
  await errorCode(await f.owner.client.get(grant.url), 404);
  await errorCode(await f.owner.client.get(grant.url, { Range: 'bytes=0-15' }), 404);
  await errorCode(await f.owner.client.post(`${f.assetPath(item.id)}/acesso`, { variant: 'display' }), 404);
});

test('mídia: Storage nega acesso direto público e com JWT comum; broker nega envelope sem MAC', async t => {
  const f = await mediaFixture(t);
  const item = await f.upload(f.owner, await fixtureBytes('photo.png'));
  await processBatch();
  const keys = await f.objectKeys(item.id);
  assert.ok(keys.some(key => key.endsWith('/display.jpg')));
  const jwt = f.owner.client.storedSession().access_token;
  for (const key of keys) for (const token of [f.environment.publishableKey, jwt]) {
    const response = await fetch(`${f.environment.supabaseURL}/storage/v1/object/authenticated/${process.env.MEDIA_BUCKET}/${key}`, {
      headers: { apikey: f.environment.publishableKey, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000),
    });
    assert.ok(!response.ok, 'Bucket privado deve negar o objeto a anon e authenticated.');
    const publicResponse = await fetch(`${f.environment.supabaseURL}/storage/v1/object/public/${process.env.MEDIA_BUCKET}/${key}`);
    assert.ok(!publicResponse.ok);
  }
  const broker = await fetch('http://127.0.0.1:4311/content', { method: 'POST', body: '',
    headers: { 'x-media-envelope': 'forjado', 'x-media-signature': 'forjado' } });
  assert.ok(!broker.ok);
});

test('mídia: Chromium autenticado reproduz derivado MP4 através de consulta privada', async t => {
  const f = await mediaFixture(t);
  const item = await f.upload(f.owner, await fixtureBytes('video.mp4'), 'video/mp4');
  await processBatch();
  const grant = await f.access(f.owner, item.id);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.addCookies([...f.owner.client.cookies].map(([name, value]) => ({ name, value,
      url: f.environment.origin, httpOnly: true, sameSite: 'Lax' })));
    const page = await context.newPage();
    await page.goto(`${f.environment.origin}/visual-check`);
    const playback = await page.evaluate(async url => {
      const video = document.createElement('video'); video.muted = true; video.controls = true;
      document.body.replaceChildren(video); video.src = url;
      await Promise.race([new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('Falha ao carregar o MP4 privado.'));
      }), new Promise((_, reject) => setTimeout(() => reject(new Error('MP4 não carregou.')), 10_000))]);
      await video.play();
      await Promise.race([new Promise(resolve => { video.ontimeupdate = resolve; }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('MP4 não avançou na reprodução.')), 10_000))]);
      return { time: video.currentTime, width: video.videoWidth, height: video.videoHeight, duration: video.duration };
    }, grant.url);
    assert.ok(playback.time > 0 && playback.width > 0 && playback.height > 0 && playback.duration > 0);
  } finally { await browser.close(); }
});

test('mídia: CLI once processa arquivo com credencial separada e repetir não duplica derivados', async t => {
  const f = await mediaFixture(t);
  const item = await f.upload(f.owner, await fixtureBytes('photo.png'));
  const run = () => execute(process.execPath, ['scripts/media-local.mjs', process.env.T02_TASK ?? 't06', 'integration', '--once'],
    { windowsHide: true, timeout: 60_000, maxBuffer: 2_000_000 });
  const first = JSON.parse((await run()).stdout.trim());
  assert.ok(first.processed >= 1); assert.equal(first.failed, 0);
  const ready = await f.asset(f.owner, item.id); assert.equal(ready.state, 'READY');
  const keys = await f.objectKeys(item.id);
  const again = JSON.parse((await run()).stdout.trim());
  assert.equal(again.processed, 0); assert.equal(again.failed, 0);
  assert.deepEqual(await f.objectKeys(item.id), keys);
});
