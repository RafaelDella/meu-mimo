import '../only.ts';
import type { FeedPage } from '../../contracts/feed.ts';
import type { Identity } from '../auth/types.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { withStoreTransaction } from '../stores/transaction.ts';
import { feedPage } from './queries.ts';

export async function listFeed(identity: Identity, storeId: string, query = new URLSearchParams()): Promise<FeedPage> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, scope => feedPage(scope, query));
}
