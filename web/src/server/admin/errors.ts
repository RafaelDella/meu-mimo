import '../only.ts';
import { AppError } from '../errors.ts';

/** Inspeciona somente códigos conhecidos; mensagens e metadados SQL nunca são renderizados. */
export function adminSqlCode(error: unknown): string | undefined {
  const pending: unknown[] = [error]; const seen = new Set<object>();
  for (let depth = 0; pending.length && depth < 20; depth += 1) {
    const item = pending.shift();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    const value = item as Record<string, unknown>;
    for (const field of ['code', 'originalCode']) {
      const code = value[field];
      if (typeof code === 'string' && /^(?:M130[01349]|40001|40P01|P2034)$/.test(code)) return code;
    }
    for (const field of ['meta', 'cause', 'driverAdapterError']) pending.push(value[field]);
  }
  return undefined;
}

export function adminDatabaseError(error: unknown): unknown {
  if (error instanceof AppError) return error;
  switch (adminSqlCode(error)) {
    case 'M1300': return new AppError('field_invalid', 400, 'Confira os campos do formulário.');
    case 'M1301': return new AppError('session_invalid', 401, 'Entre novamente na sua conta.');
    case 'M1303': return new AppError('admin_forbidden', 403, 'Acesso administrativo não permitido.');
    case 'M1304': return new AppError('resource_not_found', 404, 'Este recurso não está disponível.');
    case 'M1309': return new AppError('admin_changed', 409, 'O alvo ou a operação mudou. Atualize e revise antes de confirmar.');
    default: return error;
  }
}
