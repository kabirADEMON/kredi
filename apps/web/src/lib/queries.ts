import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { CustomerDetail, CustomerSummary, Dashboard } from './types';

export const useDashboard = () =>
  useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard') });

export const useCustomers = () =>
  useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get<{ customers: CustomerSummary[] }>('/customers')).customers,
  });

export const useCustomer = (id: string) =>
  useQuery({ queryKey: ['customer', id], queryFn: () => api.get<CustomerDetail>(`/customers/${id}`) });

// Toute modification renvoie la fiche à jour : on la met en cache et on rafraîchit les listes.
export function useCustomerMutation<V>(fn: (vars: V) => Promise<CustomerDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (detail) => {
      qc.setQueryData(['customer', detail.customer.id], detail);
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
