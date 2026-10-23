import { randomUUID } from 'node:crypto';
import { fields } from '../activities/helpers.mjs';
import { rewardFields } from '../redemptions/helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';

/** Origem real no mesmo contexto da prova de transporte; sem crédito ou ticket SQL. */
export async function memoryOrigin(owner, participant, store, membership, existingReward = null) {
  const base = `/api/lojas/${store.id}`;
  async function post(person, path, body, status) {
    const response = await person.client.post(path, body);
    expectStatus(response, status); return response.json();
  }
  const { activity } = await post(owner, `${base}/atividades`, {
    operationId: randomUUID(), ...fields({ name: 'Crédito real para álbum', points: 1, approvalMode: 'AUTOMATIC' }),
  }, 201);
  const draft = await post(participant, `${base}/atividades/${activity.id}/preparar`, { operationId: randomUUID() }, 201);
  await post(participant, `${base}/registros/${draft.id}/enviar`, {
    caption: '', evidenceAssetId: null, expectedVersion: draft.review.expectedVersion,
    expectedLocalDate: draft.review.localDate, expectedTimezone: draft.review.timezone,
  }, 200);
  const reward = existingReward ?? (await post(owner, `${base}/mimos`, {
    operationId: randomUUID(), ...rewardFields({ name: 'Origem real do álbum', cost: 1 }),
  }, 201)).reward;
  const previewResponse = await participant.client.get(`${base}/mimos/${reward.id}`);
  expectStatus(previewResponse, 200);
  const preview = await previewResponse.json();
  const { ticket } = await post(participant, `${base}/mimos/${reward.id}/resgatar`, {
    operationId: randomUUID(), expectedVersion: preview.version, expectedBalance: preview.availability.available,
  }, 200);
  const { album } = await post(owner, `${base}/tickets/${ticket.id}/album/iniciar`, { operationId: randomUUID() }, 201);
  return { id: album.collectionId, storeId: store.id, participantMembershipId: membership.id,
    purpose: 'MEMORY', subjectId: ticket.id, albumId: album.id };
}
