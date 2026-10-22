'use client';

import { useEffect } from 'react';
import { StoreRequestError } from '@/components/stores/store-api';

export function statementAccessDenied(cause: unknown): cause is StoreRequestError {
  return cause instanceof StoreRequestError && [401, 403, 404].includes(cause.status);
}

export function useStatementAccess(error: unknown, onUnavailable: (cause: StoreRequestError) => void) {
  useEffect(() => {
    if (statementAccessDenied(error)) onUnavailable(error);
  }, [error, onUnavailable]);
  return statementAccessDenied(error);
}
