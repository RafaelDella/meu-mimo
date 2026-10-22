export function points(value: string | number) { return new Intl.NumberFormat('pt-BR').format(typeof value === 'string' ? BigInt(value) : value); }
export function localTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: timezone }).format(new Date(value));
}
