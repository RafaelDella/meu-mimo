import { testWeb } from './test-web.mjs';

if (process.argv[2] !== 'test') throw new Error('Use o comando local de QA real.');
process.exitCode = await testWeb(process.argv.slice(3));
