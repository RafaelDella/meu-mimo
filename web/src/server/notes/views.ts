import '../only.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { NoteCurrent, NoteVersion, ParticipantNoteCurrent } from '../../contracts/notes.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';

export const noteVersionSelect = { id: true, storeId: true, participantMembershipId: true, version: true,
  text: true, createdAt: true, actor: { select: { displayName: true } } } satisfies Prisma.NoteVersionSelect;
export type SelectedNoteVersion = Prisma.NoteVersionGetPayload<{ select: typeof noteVersionSelect }>;

export function noteVersionView(version: SelectedNoteVersion): NoteVersion {
  return { id: version.id, storeId: version.storeId, participantMembershipId: version.participantMembershipId,
    version: version.version, text: version.text, createdAt: version.createdAt.toISOString(), author: version.actor };
}

export async function noteCurrent(scope: StoreScope, membershipId: string): Promise<NoteCurrent | ParticipantNoteCurrent> {
  const actor = requireMembership(scope);
  const participant = await requireConversationAudience(scope, membershipId);
  const note = await scope.tx.personalNote.findUnique({ where: { participantMembershipId: participant.id } });
  const version = note ? await scope.tx.noteVersion.findUnique({
    where: { noteId_version: { noteId: note.id, version: note.version } }, select: noteVersionSelect,
  }) : null;
  const current = version ? noteVersionView(version) : null;
  const writable = actor.role === 'MERCHANT' && !actor.closedAt && !participant.closedAt && scope.store.state !== 'CLOSED';
  if (actor.role === 'MERCHANT') return { current, writable };
  const read = current ? await scope.tx.noteRead.findUnique({
    where: { noteVersionId_readerMembershipId: { noteVersionId: current.id, readerMembershipId: participant.id } },
    select: { noteVersionId: true },
  }) : null;
  return { current, writable, unread: !!current && !read };
}
