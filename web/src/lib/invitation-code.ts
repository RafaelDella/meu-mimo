export const invitationCodeAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function normalizeInvitationCode(value: string): string | null {
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const compact = value.trim().toUpperCase();
  if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}-?[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/.test(compact)) return null;
  return compact.replace('-', '');
}

export function displayInvitationCode(value: string): string {
  const normalized = normalizeInvitationCode(value);
  return normalized ? `${normalized.slice(0, 5)}-${normalized.slice(5)}` : value;
}
