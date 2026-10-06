import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { api, ApiError } from './api';
import type { Merchant } from './types';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get<{ merchant: Merchant }>('/auth/me')).merchant;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<{ ok: boolean; payments: 'fedapay' | 'mock'; demo: boolean }>('/health'),
    staleTime: Infinity,
  });
}

export function useSignedIn() {
  const qc = useQueryClient();
  return (merchant: Merchant) => {
    qc.clear();
    qc.setQueryData(['me'], merchant);
  };
}

export function RequireMerchant({ children }: { children: (merchant: Merchant) => ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) {
    return (
      <div className="auth" aria-busy="true">
        <span className="spinner" style={{ color: 'var(--brand)', width: 28, height: 28 }} />
      </div>
    );
  }
  if (!me.data) return <Navigate to={`/connexion?retour=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children(me.data)}</>;
}
