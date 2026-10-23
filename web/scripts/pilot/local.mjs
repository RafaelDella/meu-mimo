import { testWeb } from './test-web.mjs';
import { HEALTH_CODES } from './process-contract.mjs';

const [command, ...args] = process.argv.slice(2);
const print = value => process.stdout.write(`${JSON.stringify(value)}\n`);
try {
  if (command === 'test') process.exitCode = await testWeb(args);
  else {
    if (args.length || !['web', 'health', 'stop'].includes(command)) {
      throw Object.assign(new Error('LOCAL_COMMAND_INVALID'), { code: 'LOCAL_COMMAND_INVALID' });
    }
    const { runSupervisor, readSupervisor, requestStop } = await import('./processes.mjs');
    if (command === 'stop') {
      const result = await requestStop(); print(result);
      if (result.code === 'LOCAL_STOP_PENDING') process.exitCode = 1;
    } else if (command === 'health') {
      const { localHealth } = await import('./health.mjs');
      const result = await localHealth({ snapshot: await readSupervisor(), now: new Date(), signal: new AbortController().signal });
      print(result); if (result.status !== 'ready') process.exitCode = 1;
    } else {
      const { createLocalGates } = await import('./maintenance.mjs');
      const { writeLocalLog, writeAdminDiagnostic } = await import('./local-diagnostics.mjs');
      await runSupervisor({ gates: createLocalGates(),
        onStatus: async event => { print(event); await writeLocalLog({ code: event.code, counts: {} }); },
        onDiagnostic: writeAdminDiagnostic });
    }
  }
} catch (error) {
  const allowed = [...HEALTH_CODES, 'PROCESS_CONTRACT_INVALID', 'LOCAL_STOP_PENDING', 'LOCAL_ALREADY_RUNNING',
    'LOCAL_OWNERSHIP_CONFLICT', 'LOCAL_CHILD_STILL_RUNNING', 'LOCAL_PORT_INVALID', 'LOCAL_PORT_IN_USE',
    'PROCESS_IDENTITY_UNAVAILABLE', 'PROCESS_IDENTITY_UNSTABLE', 'PROCESS_IPC_INVALID', 'WORKER_BOOT_TIMEOUT',
    'SOURCE_RESTART_PENDING', 'LOCAL_DIAGNOSTICS_FAILED', 'LOCAL_FAILED', 'LOCAL_COMMAND_INVALID'];
  print({ code: allowed.includes(error.code) ? error.code : 'LOCAL_OPERATION_FAILED' }); process.exitCode = 1;
}
