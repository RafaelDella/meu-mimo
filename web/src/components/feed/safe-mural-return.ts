// Compartilhado pela página de servidor e pelos links do mural; não aceita
// outra origem/loja, fragmentos, parâmetros privados ou filtros desconhecidos.
export function safeMuralReturn(storeId: string, value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined;
  let url: URL; try { url = new URL(value, 'http://local.invalid'); } catch { return undefined; }
  const path = `/lojas/${storeId}/mural`;
  if (url.origin !== 'http://local.invalid' || url.pathname !== path || url.hash) return undefined;
  const allowed: Record<string, RegExp> = {
    type: /^(SUBMISSION|TICKET)$/, status: /^(PENDING|APPROVED|CONTESTED|VOIDED|WAITING_AGREEMENT|AGREED|CANCELLATION_REQUESTED|FULFILLED|CANCELLED)$/,
    participantMembershipId: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    from: /^\d{4}-\d{2}-\d{2}$/, to: /^\d{4}-\d{2}-\d{2}$/, page: /^[1-9]\d{0,8}$/, pageSize: /^(20|50)$/,
  };
  const params = new URLSearchParams();
  for (const [key, entry] of url.searchParams) {
    if (!allowed[key]?.test(entry) || params.has(key)) return undefined;
    params.set(key, entry);
  }
  return `${path}${params.size ? `?${params}` : ''}`;
}
