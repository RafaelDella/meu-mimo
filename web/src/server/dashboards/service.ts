import '../only.ts';
import type { DashboardEvent, MerchantDashboard, ParticipantDashboard, PersonDashboard } from '../../contracts/dashboards.ts';
import type { PageResult } from '../../contracts/stores.ts';
import type { Identity } from '../auth/types.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { withStoreTransaction } from '../stores/transaction.ts';
import { dashboardEvents } from './queries.ts';
import { merchantDashboard, participantDashboard, personDashboard } from './views.ts';

export async function readMerchantDashboard(identity: Identity, storeId: string): Promise<MerchantDashboard> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, merchantDashboard);
}

export async function readParticipantDashboard(identity: Identity, storeId: string): Promise<ParticipantDashboard> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, participantDashboard);
}

export async function readPersonDashboard(identity: Identity, storeId: string, membershipId: string): Promise<PersonDashboard> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, scope => personDashboard(scope, membershipId));
}

export async function listDashboardEvents(identity: Identity, storeId: string, query = new URLSearchParams()): Promise<PageResult<DashboardEvent>> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, scope => dashboardEvents(scope, query));
}
