export type NoteVersion = {
  id: string; storeId: string; participantMembershipId: string; version: number;
  text: string; createdAt: string; author: { displayName: string | null };
};
export type NoteCurrent = { current: NoteVersion | null; writable: boolean };
export type ParticipantNoteCurrent = NoteCurrent & { unread: boolean };
export type NoteBody = { operationId: string; expectedVersion: number; text: string };
export type NoteMutation = { applied: NoteVersion; current: NoteVersion; appliedVersion: number };
export type NoteLookup = { operation: NoteMutation | null };
