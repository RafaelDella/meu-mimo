export function durationLabel(durationMs: number | null) {
  return durationMs === null ? '' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(durationMs / 1000)} s`;
}
