import '../only.ts';
import { randomUUID } from 'node:crypto';
import type { NoteVersion as StoredNoteVersion } from '../../generated/prisma/client.ts';
import type { NoteCurrent, NoteLookup, NoteMutation, NoteVersion, ParticipantNoteCurrent } from '../../contracts/notes.ts';
import type { Identity } from '../auth/types.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import { AppError } from '../errors.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import { enqueueNoteSent } from '../outbox/events.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { assertStoreWritable, databaseNow, requireMembership, requireMerchant, withStoreTransaction } from '../stores/transaction.ts';
import { operationConflict, resourceId, unavailable } from '../stores/validation.ts';
import { noteInput } from './validation.ts';
import { noteCurrent, noteVersionSelect, noteVersionView } from './views.ts';

async function result(scope: StoreScope, version: StoredNoteVersion): Promise<NoteMutation> {
  const current = await noteCurrent(scope, version.participantMembershipId);
  const applied = await scope.tx.noteVersion.findUniqueOrThrow({ where: { id: version.id }, select: noteVersionSelect });
  if (!current.current) unavailable();
  return { applied: noteVersionView(applied, await suppressionFor(scope.tx, [applied.actorProfileId])), current: current.current, appliedVersion: version.version };
}

export async function readOwnNote(identity: Identity, storeId: string): Promise<ParticipantNoteCurrent> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const actor = requireMembership(scope);
    if (actor.role !== 'PARTICIPANT') unavailable();
    return await noteCurrent(scope, actor.id) as ParticipantNoteCurrent;
  });
}

export async function readParticipantNote(identity: Identity, storeId: string, membershipId: string): Promise<NoteCurrent> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    if (requireMembership(scope).role !== 'MERCHANT') unavailable();
    return noteCurrent(scope, membershipId);
  });
}

export async function sendNote(identity: Identity, storeId: string, membershipId: string,
  body: Record<string, unknown>): Promise<NoteMutation> {
  const input = noteInput(body);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    if (requireMembership(scope).role !== 'MERCHANT') unavailable();
    const participant = await requireConversationAudience(scope, membershipId);
    const key = `meumimo:t12:note-operation:${input.id}`;
    await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const previous = await scope.tx.noteVersion.findUnique({ where: { id: input.id } });
    if (previous) {
      if (previous.storeId !== scope.store.id || previous.participantMembershipId !== participant.id ||
          previous.actorProfileId !== identity.userId || previous.requestDigest !== input.requestDigest) operationConflict();
      return result(scope, previous);
    }
    requireMerchant(scope);
    assertStoreWritable(scope, true);
    if (participant.closedAt) throw new AppError('membership_closed', 409, 'Esta participação está disponível somente para consulta.');
    const note = await scope.tx.personalNote.findUnique({ where: { participantMembershipId: participant.id } });
    if ((note?.version ?? 0) !== input.expectedVersion) {
      throw new AppError('note_changed', 409, 'O bilhete mudou. Confira a versão atual antes de enviar.');
    }
    const projection = note ? await scope.tx.personalNote.update({ where: { id: note.id }, data: { version: { increment: 1 } } }) :
      await scope.tx.personalNote.create({ data: { id: randomUUID(), storeId: scope.store.id,
        participantMembershipId: participant.id, version: 1 } });
    const version = await scope.tx.noteVersion.create({ data: { id: input.id, noteId: projection.id, storeId: scope.store.id,
      participantMembershipId: participant.id, actorProfileId: identity.userId, version: projection.version,
      text: input.text, requestDigest: input.requestDigest, createdAt: await databaseNow(scope.tx) } });
    await enqueueNoteSent(scope.tx, version.id);
    return result(scope, version);
  });
}

export async function lookupNoteOperation(identity: Identity, storeId: string, membershipId: string, operationId: string): Promise<NoteLookup> {
  const id = resourceId(operationId);
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    if (requireMembership(scope).role !== 'MERCHANT') unavailable();
    const participant = await requireConversationAudience(scope, membershipId);
    const version = await scope.tx.noteVersion.findUnique({ where: { id } });
    if (!version) return { operation: null };
    if (version.storeId !== scope.store.id || version.participantMembershipId !== participant.id ||
        version.actorProfileId !== identity.userId) unavailable();
    return { operation: await result(scope, version) };
  });
}

async function accessibleVersion(scope: StoreScope, versionId: string) {
  const version = await scope.tx.noteVersion.findFirst({ where: { id: resourceId(versionId), storeId: scope.store.id },
    select: noteVersionSelect });
  if (!version) unavailable();
  await requireConversationAudience(scope, version.participantMembershipId);
  return version;
}

export async function readNoteVersion(identity: Identity, storeId: string, versionId: string): Promise<NoteVersion> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const version = await accessibleVersion(scope, versionId);
    return noteVersionView(version, await suppressionFor(scope.tx, [version.actorProfileId]));
  });
}

export async function markNoteVersionRead(identity: Identity, storeId: string, versionId: string): Promise<{ versionId: string; readAt: string }> {
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    const version = await accessibleVersion(scope, versionId);
    const actor = requireMembership(scope);
    if (actor.role !== 'PARTICIPANT' || actor.id !== version.participantMembershipId) unavailable();
    await scope.tx.noteRead.createMany({ data: { noteVersionId: version.id, readerMembershipId: actor.id,
      actorProfileId: identity.userId, readAt: await databaseNow(scope.tx) }, skipDuplicates: true });
    const read = await scope.tx.noteRead.findUniqueOrThrow({ where: {
      noteVersionId_readerMembershipId: { noteVersionId: version.id, readerMembershipId: actor.id },
    } });
    return { versionId: version.id, readAt: read.readAt.toISOString() };
  });
}
