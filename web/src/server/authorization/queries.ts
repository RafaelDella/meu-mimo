import '../only.ts';

// Compatibilidade dos chamadores da fundação; os DTOs evoluem em T04.
export { readStore } from '../stores/service.ts';
export { listMemberships, readMembership } from '../memberships/service.ts';
