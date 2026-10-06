// Règles du carnet, sans base de données : tout est calculé à partir des opérations.
// Le solde n'est jamais stocké, il ne peut donc pas se désynchroniser.

export type LedgerEntry = {
  id: string;
  type: 'credit' | 'payment' | 'reversal';
  amount: number;
  dueDate: string | null;
  createdAt: Date;
  seq: number;
  reversesId: string | null;
  paymentId: string | null;
};

export type HistoryLine<E extends LedgerEntry> = E & {
  // Solde du client juste après cette opération.
  balanceAfter: number;
  // Opération annulée plus tard (barrée dans l'historique).
  reversed: boolean;
};

export type Summary = {
  balance: number;
  totalCredit: number;
  totalPaid: number;
  // Reste dû sur les crédits dont l'échéance est passée (remboursements imputés aux plus anciens).
  overdueAmount: number;
  oldestOverdueDate: string | null;
  nextDueDate: string | null;
  lastActivityAt: Date | null;
};

const byDate = (a: LedgerEntry, b: LedgerEntry) => a.createdAt.getTime() - b.createdAt.getTime() || a.seq - b.seq;

export function reversedIds(entries: readonly LedgerEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const e of entries) if (e.type === 'reversal' && e.reversesId) ids.add(e.reversesId);
  return ids;
}

// Opérations qui comptent : ni annulées, ni annulations.
export function effectiveEntries<E extends LedgerEntry>(entries: readonly E[]): E[] {
  const reversed = reversedIds(entries);
  return entries.filter((e) => e.type !== 'reversal' && !reversed.has(e.id)).sort(byDate);
}

export function summarize(entries: readonly LedgerEntry[], today: string): Summary {
  const effective = effectiveEntries(entries);
  let totalCredit = 0;
  let totalPaid = 0;
  for (const e of effective) {
    if (e.type === 'credit') totalCredit += e.amount;
    else totalPaid += e.amount;
  }

  // Imputation FIFO : chaque franc remboursé solde d'abord le crédit le plus ancien.
  let paidPool = totalPaid;
  let overdueAmount = 0;
  let oldestOverdueDate: string | null = null;
  let nextDueDate: string | null = null;
  for (const credit of effective) {
    if (credit.type !== 'credit') continue;
    const covered = Math.min(paidPool, credit.amount);
    paidPool -= covered;
    const remaining = credit.amount - covered;
    if (remaining === 0 || !credit.dueDate) continue;
    if (credit.dueDate < today) {
      overdueAmount += remaining;
      if (!oldestOverdueDate || credit.dueDate < oldestOverdueDate) oldestOverdueDate = credit.dueDate;
    } else if (!nextDueDate || credit.dueDate < nextDueDate) {
      nextDueDate = credit.dueDate;
    }
  }

  const last = [...entries].sort(byDate).at(-1);
  return {
    balance: totalCredit - totalPaid,
    totalCredit,
    totalPaid,
    overdueAmount,
    oldestOverdueDate,
    nextDueDate,
    lastActivityAt: last?.createdAt ?? null,
  };
}

// Historique chronologique avec le solde après chaque ligne. Une annulation fait
// l'inverse de l'opération qu'elle annule, au moment où elle a été saisie.
export function history<E extends LedgerEntry>(entries: readonly E[]): HistoryLine<E>[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const reversed = reversedIds(entries);
  let balance = 0;
  return [...entries].sort(byDate).map((e) => {
    balance += signedImpact(e, byId);
    return { ...e, balanceAfter: balance, reversed: reversed.has(e.id) };
  });
}

function signedImpact(e: LedgerEntry, byId: Map<string, LedgerEntry>): number {
  if (e.type === 'credit') return e.amount;
  if (e.type === 'payment') return -e.amount;
  const target = e.reversesId ? byId.get(e.reversesId) : undefined;
  return target?.type === 'credit' ? -e.amount : e.amount;
}

export type ReverseCheck = { ok: true } | { ok: false; reason: string };

export function canReverse(target: LedgerEntry, entries: readonly LedgerEntry[]): ReverseCheck {
  if (target.type === 'reversal') return { ok: false, reason: 'Une annulation ne peut pas être annulée.' };
  if (reversedIds(entries).has(target.id)) return { ok: false, reason: 'Cette opération est déjà annulée.' };
  if (target.paymentId) {
    return { ok: false, reason: 'Un paiement Mobile Money reçu ne peut pas être annulé ici.' };
  }
  if (target.type === 'credit') {
    const { balance } = summarize(entries, '0000-00-00');
    if (balance - target.amount < 0) {
      return {
        ok: false,
        reason: 'Annuler ce crédit rendrait le solde négatif. Annulez d’abord le remboursement concerné.',
      };
    }
  }
  return { ok: true };
}
