import '../only.ts';
import type { Suppression, Suppressions } from './suppression.ts';

export function publicAuthor<T extends { displayName: string | null }>(author: T, suppression?: Suppression): T {
  return { ...author, displayName: suppression?.identity ? 'Conta removida' : author.displayName };
}

export function visibleAuthoredText(value: string, authorId: string, suppressions: Suppressions): string {
  return suppressions.get(authorId)?.authoredContent ? '[Conteúdo removido]' : value;
}

export function visibleAuthoredFields<T extends object>(value: T, fields: readonly (keyof T)[],
  authorId: string, suppressions: Suppressions): T {
  const result = { ...value };
  if (suppressions.get(authorId)?.authoredContent) {
    for (const key of fields) if (typeof result[key] === 'string') result[key] = '[Conteúdo removido]' as T[keyof T];
  }
  return result;
}
