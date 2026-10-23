import { openWorkerChannel } from '../../scripts/pilot/worker-heartbeat.mjs';

const channel = openWorkerChannel('media');
try {
  await channel.initialized;
  if (!channel.managed) process.stdout.write('STANDALONE_READY\n');
  else {
    channel.round({ code: 'OK', durationMs: 1, counts: { processed: 1 } });
    channel.setPhase('busy');
    if (!channel.signal.aborted) await new Promise(resolve => channel.signal.addEventListener('abort', resolve, { once: true }));
  }
} catch { process.exitCode = 1; }
finally { await channel.finish(); }
