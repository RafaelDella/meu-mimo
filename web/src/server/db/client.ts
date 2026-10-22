import '../only.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.ts';
import { getServerEnv } from '../env.ts';

const databaseGlobal = globalThis as typeof globalThis & {
  meuMimoDatabase?: PrismaClient;
};

export function getDb(): PrismaClient {
  if (!databaseGlobal.meuMimoDatabase) {
    const adapter = new PrismaPg({
      connectionString: getServerEnv().databaseUrl,
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
    }, { schema: 'app' });
    databaseGlobal.meuMimoDatabase = new PrismaClient({ adapter });
  }
  return databaseGlobal.meuMimoDatabase;
}
