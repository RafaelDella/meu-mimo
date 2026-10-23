import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { restoreClient } from './restore-state.mjs';
import { containerRoute } from './backup-streams.mjs';
import { createRestoreContainer } from './restore-stack.mjs';

async function uploadPrivateFile(engine, id, source, filename) {
  const stat = await lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink() || !/^[a-zA-Z0-9_-]+\.jsonl$/.test(filename)) throw new Error('Inventário de Storage inválido.');
  const header = Buffer.alloc(512); header.write(filename); header.write('0000600\0', 100);
  header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write(`${stat.size.toString(8).padStart(11, '0')}\0`, 124); header.write('00000000000\0', 136);
  header.fill(32, 148, 156); header[156] = 48; header.write('ustar\0', 257); header.write('00', 263);
  const checksum = header.reduce((total, value) => total + value, 0); header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148);
  async function* archive() {
    yield header;
    for await (const chunk of createReadStream(source)) yield chunk;
    yield Buffer.alloc((512 - stat.size % 512) % 512 + 1024);
  }
  await engine.putArchive(id, '/tmp', Readable.from(archive()));
}

const remapScript = String.raw`
const fs=require('node:fs');const fsp=require('node:fs/promises');const path=require('node:path');
const readline=require('node:readline');const {createHash}=require('node:crypto');
async function digest(file){const h=createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');}
async function safe(file){if(!file.startsWith('/mnt/'))throw Error();let current='/';for(const part of file.slice(1).split('/')){current=path.join(current,part);const st=await fsp.lstat(current);if(st.isSymbolicLink())throw Error();}return fsp.lstat(file);}
(async()=>{const [inventory,source,target]=process.argv.slice(1);if(!/^t14-(development|integration)$/.test(source)||target!=='t14-restore')throw Error();
let files=0,bytes=0,remapped=0;const lines=readline.createInterface({input:fs.createReadStream(inventory),crlfDelay:Infinity});
for await(const line of lines){if(!line||line.length>32768)throw Error();const record=JSON.parse(line);if(!/^mnt\//.test(record.path)||record.path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error();
const file='/'+record.path;const stat=await safe(file);if(!stat.isFile()||stat.size!==record.bytes||await digest(file)!==record.sha256)throw Error();
const pieces=record.path.split('/');const matches=pieces.filter(p=>p===source).length;if(matches>1)throw Error();
if(matches){const destination='/'+pieces.map(p=>p===source?target:p).join('/');try{await fsp.lstat(destination);throw Error();}catch(e){if(e.code!=='ENOENT')throw e;}
await fsp.mkdir(path.dirname(destination),{recursive:true,mode:0o700});await fsp.rename(file,destination);if(await digest(destination)!==record.sha256)throw Error();remapped++;}
files++;bytes+=record.bytes;}
await fsp.unlink(inventory);process.stdout.write(JSON.stringify({files,bytes,remapped}));})().catch(()=>process.exit(1));`;

export async function remapRestoredStorage(engine, context) {
  const id = context.containers.storage;
  const filename = `storage-${context.owner}.jsonl`;
  await uploadPrivateFile(engine, id, context.plaintext.get('storage-inventory'), filename);
  await engine.request('POST', `${containerRoute(id)}/start`);
  const counts = JSON.parse(await engine.exec(id, ['node', '-e', remapScript, `/tmp/${filename}`, context.manifest.sourcePrefix, 't14-restore']));
  const expected = context.manifest.components.find(item => item.name === 'storage').counts;
  if (counts.files !== expected.files || counts.bytes !== expected.bytes) throw new Error('Inventário físico de Storage divergiu.');
  await engine.stop(id);
  const stopped = await engine.request('GET', `${containerRoute(id)}/json`);
  if (stopped.State.Running || stopped.Config.Labels?.['dev.meumimo.restore-owner'] !== context.owner) throw new Error('Posse do Storage divergiu.');
  await engine.request('DELETE', `${containerRoute(id)}?v=false&force=false`);
  delete context.containers.storage;
  const client = restoreClient(context);
  await client.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT count(*)::int AS count FROM storage.objects
      WHERE bucket_id='meumimo-t06-private' AND left(name,length($1)+1)=$1||'/'`, ['t14-restore']);
    if (existing.rows[0].count) throw new Error('Namespace de recuperação já estava presente na captura.');
    const moved = await client.query(`UPDATE storage.objects SET name=$2||substring(name FROM length($1)+1)
      WHERE bucket_id='meumimo-t06-private' AND left(name,length($1)+1)=$1||'/'`, [context.manifest.sourcePrefix, 't14-restore']);
    if (moved.rowCount > counts.remapped || (moved.rowCount && !counts.remapped)) throw new Error('Metadados sem bytes correspondentes no Storage.');
    const bucket = await client.query(`SELECT public FROM storage.buckets WHERE id='meumimo-t06-private'`);
    if (bucket.rowCount !== 1 || bucket.rows[0].public) throw new Error('Bucket de recuperação não está privado.');
    await client.query('COMMIT');
    counts.objects = moved.rowCount;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
  await createRestoreContainer(engine, context, 'storage');
  return counts;
}

const verifyScript = String.raw`
const {createHash}=require('node:crypto');
(async()=>{const [body,key]=process.argv.slice(1);const objects=JSON.parse(body);let verified=0;
for(const object of objects){const url='http://127.0.0.1:5000/object/authenticated/'+encodeURIComponent(object.bucket_id)+'/'+object.name.split('/').map(encodeURIComponent).join('/');
const response=await fetch(url,{headers:{Authorization:'Bearer '+key,apikey:key},redirect:'error'});if(!response.ok||!response.body)throw Error();
let count=0;const hash=createHash('sha256');for await(const chunk of response.body){count+=chunk.length;hash.update(chunk);}if(count!==object.bytes||hash.digest('hex')!==object.sha256)throw Error();verified++;}
process.stdout.write(JSON.stringify({verified}));})().catch(()=>process.exit(1));`;

export async function verifyRestoredObjects(engine, context) {
  const client = restoreClient(context); await client.connect(); let verified = 0;
  try {
    for (let offset = 0; ; offset += 100) {
      const page = await client.query(`SELECT bucket_id,name,metadata,version FROM storage.objects WHERE bucket_id='meumimo-t06-private'
        AND left(name,12)='t14-restore/' ORDER BY name LIMIT 100 OFFSET $1`, [offset]);
      if (!page.rowCount) break;
      const expected = new Map();
      const lines = createInterface({ input: createReadStream(context.plaintext.get('storage-inventory')), crlfDelay: Infinity });
      for await (const line of lines) {
        if (line.length > 32768) throw new Error('Inventário de objeto excedeu o limite.');
        const record = JSON.parse(line);
        for (const object of page.rows) {
          const original = object.name.replace(/^t14-restore\//, `${context.manifest.sourcePrefix}/`);
          const key = `${object.bucket_id}/${original}`;
          const suffixes = object.version ? [`/${key}/${object.version}`, `/${key}-$v-${object.version}`] : [`/${key}`];
          if (!suffixes.some(suffix => record.path.endsWith(suffix))) continue;
          if (expected.has(object.name) || record.bytes !== Number(object.metadata.size)) throw new Error('Inventário de objeto ambíguo.');
          expected.set(object.name, { bucket_id: object.bucket_id, name: object.name, bytes: record.bytes, sha256: record.sha256 });
        }
      }
      if (expected.size !== page.rowCount) throw new Error('Objeto de Storage não possui bytes inventariados.');
      const result = JSON.parse(await engine.exec(context.containers.storage, ['node', '-e', verifyScript,
        JSON.stringify([...expected.values()]), context.secrets.service]));
      if (result.verified !== page.rowCount) throw new Error('Leitura dos objetos da recuperação divergiu.');
      verified += result.verified;
      if (page.rowCount < 100) break;
    }
  } finally { await client.end(); }
  return verified;
}
