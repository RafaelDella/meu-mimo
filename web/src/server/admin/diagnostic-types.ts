export const adminRoutes = ['SESSION', 'OVERVIEW', 'ACCOUNT_SEARCH', 'ACCOUNT_DETAIL', 'ACCOUNT_RELATIONS',
  'STORE_SEARCH', 'STORE_DETAIL', 'ACTION_HISTORY', 'ACTION_APPLY', 'ACTION_LOOKUP'] as const;
export const adminResults = ['OK', 'INVALID_INPUT', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND',
  'CONFLICT', 'RATE_LIMITED', 'UNAVAILABLE'] as const;
export type AdminRouteCode = typeof adminRoutes[number];
export type AdminResultCode = typeof adminResults[number];
export type DiagnosticEvent = {
  route: AdminRouteCode; result: AdminResultCode; status: number; durationMs: number; correlationId: string;
};
