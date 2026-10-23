const fallback = '/conta';
const allowedPath = /^\/(?:conta|convites|lojas|admin)(?:\/[a-zA-Z0-9_-]+)*\/?$/;
const forbidden = /[\u0000-\u001f\u007f\\]/;

export function safeReturnPath(value: string | null): string {
  if (!value || value.length > 2048 || forbidden.test(value)) return fallback;
  const pathname = value.split(/[?#]/, 1)[0];
  if (!allowedPath.test(pathname)) return fallback;

  // Valida também codificações aninhadas, sem decodificar o destino devolvido.
  // Isso preserva parâmetros como %20 e impede controles/barra invertida.
  let decoded = value;
  try {
    for (let depth = 0; depth < 5; depth += 1) {
      if (forbidden.test(decoded)) return fallback;
      if (!decoded.includes('%')) return value;
      decoded = decodeURIComponent(decoded);
    }
  } catch {
    return fallback;
  }
  return fallback;
}
