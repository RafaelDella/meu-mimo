import '../only.ts';
import type { Prisma } from '../../generated/prisma/client.ts';

export type Suppression = { identity: boolean; authoredContent: boolean };
export type Suppressions = ReadonlyMap<string, Suppression>;

/** Uma consulta por conjunto de autores; não persiste nem amplia permissões. */
export async function suppressionFor(tx: Pick<Prisma.TransactionClient, 'dataSuppression'>,
  profileIds: string[]): Promise<Map<string, Suppression>> {
  const ids = [...new Set(profileIds)];
  const result = new Map(ids.map(id => [id, { identity: false, authoredContent: false }]));
  if (!ids.length) return result;
  const rows = await tx.dataSuppression.findMany({ where: { subjectProfileId: { in: ids } },
    select: { subjectProfileId: true, scope: true } });
  for (const row of rows) {
    const value = result.get(row.subjectProfileId)!;
    if (row.scope === 'IDENTITY') value.identity = true;
    if (row.scope === 'AUTHORED_CONTENT') value.authoredContent = true;
  }
  return result;
}

export const visibleMediaAuthor = { dataSuppressions: { none: { scope: { in: ['IDENTITY', 'AUTHORED_CONTENT'] as ('IDENTITY' | 'AUTHORED_CONTENT')[] } } } };
