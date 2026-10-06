import { and, asc, desc, eq, gte } from 'drizzle-orm';
import type { DB, Tx } from '../db/client.js';
import { customers, entries, merchants, type Customer, type Entry, type Merchant } from '../db/schema.js';
import { localDay, localMonth } from '../domain/dates.js';
import { canReverse, effectiveEntries, history, summarize, type Summary } from '../domain/ledger.js';
import { HttpError, notFound } from '../lib/errors.js';

export type EntryDto = {
  id: string;
  type: Entry['type'];
  amount: number;
  note: string | null;
  dueDate: string | null;
  method: Entry['method'];
  reversesId: string | null;
  viaMomo: boolean;
  createdAt: string;
  balanceAfter: number;
  reversed: boolean;
};

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string | null;
  archived: boolean;
  balance: number;
  overdueAmount: number;
  oldestOverdueDate: string | null;
  nextDueDate: string | null;
  lastActivityAt: string | null;
};

export function toEntryDto(line: ReturnType<typeof history<Entry>>[number]): EntryDto {
  return {
    id: line.id,
    type: line.type,
    amount: line.amount,
    note: line.note,
    dueDate: line.dueDate,
    method: line.method,
    reversesId: line.reversesId,
    viaMomo: line.paymentId !== null,
    createdAt: line.createdAt.toISOString(),
    balanceAfter: line.balanceAfter,
    reversed: line.reversed,
  };
}

function toListItem(c: Customer, s: Summary): CustomerListItem {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    archived: c.archivedAt !== null,
    balance: s.balance,
    overdueAmount: s.overdueAmount,
    oldestOverdueDate: s.oldestOverdueDate,
    nextDueDate: s.nextDueDate,
    lastActivityAt: s.lastActivityAt?.toISOString() ?? null,
  };
}

export async function getOwnedCustomer(db: DB | Tx, merchantId: string, customerId: string): Promise<Customer> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.merchantId, merchantId)));
  if (!customer) throw notFound('Client');
  return customer;
}

export async function customerEntries(db: DB | Tx, customerId: string): Promise<Entry[]> {
  return db
    .select()
    .from(entries)
    .where(eq(entries.customerId, customerId))
    .orderBy(asc(entries.createdAt), asc(entries.seq));
}

export async function customerDetail(db: DB, merchantId: string, customerId: string) {
  const customer = await getOwnedCustomer(db, merchantId, customerId);
  const list = await customerEntries(db, customer.id);
  const summary = summarize(list, localDay());
  return {
    customer: {
      ...toListItem(customer, summary),
      shareToken: customer.shareToken,
      createdAt: customer.createdAt.toISOString(),
    },
    totals: { totalCredit: summary.totalCredit, totalPaid: summary.totalPaid },
    entries: history(list).map(toEntryDto).reverse(),
  };
}

export async function listCustomers(db: DB, merchantId: string): Promise<CustomerListItem[]> {
  const [all, allEntries] = await Promise.all([
    db.select().from(customers).where(eq(customers.merchantId, merchantId)),
    db.select().from(entries).where(eq(entries.merchantId, merchantId)),
  ]);
  const byCustomer = new Map<string, Entry[]>();
  for (const e of allEntries) {
    const bucket = byCustomer.get(e.customerId);
    if (bucket) bucket.push(e);
    else byCustomer.set(e.customerId, [e]);
  }
  const today = localDay();
  return all.map((c) => toListItem(c, summarize(byCustomer.get(c.id) ?? [], today)));
}

export async function dashboard(db: DB, merchantId: string) {
  const list = (await listCustomers(db, merchantId)).filter((c) => !c.archived);
  const debtors = list.filter((c) => c.balance > 0);
  const overdue = list.filter((c) => c.overdueAmount > 0);

  // Encaissé ce mois : remboursements effectifs (non annulés) saisis ce mois-ci, heure du Bénin.
  const monthStart = new Date(Date.now() - 32 * 86_400_000);
  const recentEntries = await db
    .select()
    .from(entries)
    .where(and(eq(entries.merchantId, merchantId), gte(entries.createdAt, monthStart)));
  const month = localMonth();
  const reversedTargets = new Set(recentEntries.filter((e) => e.reversesId).map((e) => e.reversesId!));
  const effectiveThisMonth = recentEntries.filter(
    (e) => e.type !== 'reversal' && !reversedTargets.has(e.id) && localMonth(e.createdAt) === month,
  );
  const collectedThisMonth = effectiveThisMonth.filter((e) => e.type === 'payment').reduce((s, e) => s + e.amount, 0);
  const creditedThisMonth = effectiveThisMonth.filter((e) => e.type === 'credit').reduce((s, e) => s + e.amount, 0);

  const recent = await db
    .select({ entry: entries, customerName: customers.name })
    .from(entries)
    .innerJoin(customers, eq(customers.id, entries.customerId))
    .where(eq(entries.merchantId, merchantId))
    .orderBy(desc(entries.createdAt), desc(entries.seq))
    .limit(8);

  return {
    totalDue: debtors.reduce((s, c) => s + c.balance, 0),
    debtorsCount: debtors.length,
    overdueAmount: overdue.reduce((s, c) => s + c.overdueAmount, 0),
    overdueCount: overdue.length,
    collectedThisMonth,
    creditedThisMonth,
    customersCount: list.length,
    recent: recent.map((r) => ({
      id: r.entry.id,
      customerId: r.entry.customerId,
      customerName: r.customerName,
      type: r.entry.type,
      amount: r.entry.amount,
      note: r.entry.note,
      viaMomo: r.entry.paymentId !== null,
      createdAt: r.entry.createdAt.toISOString(),
    })),
  };
}

// Verrouille la ligne du client pendant la transaction : deux saisies simultanées
// (deux vendeurs, double clic, webhook) sont traitées l'une après l'autre.
export async function lockCustomer(tx: Tx, customerId: string) {
  await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).for('update');
}

type NewEntry =
  | { type: 'credit'; amount: number; note: string | null; dueDate: string | null }
  | { type: 'payment'; amount: number; note: string | null; method: 'cash' | 'momo' };

export async function addEntry(db: DB, merchant: Merchant, customerId: string, input: NewEntry) {
  return db.transaction(async (tx) => {
    const customer = await getOwnedCustomer(tx, merchant.id, customerId);
    if (customer.archivedAt)
      throw new HttpError(409, 'archived', 'Ce client est archivé. Réactivez-le pour noter une opération.');
    await lockCustomer(tx, customer.id);

    if (input.type === 'payment') {
      const { balance } = summarize(await customerEntries(tx, customer.id), localDay());
      if (balance <= 0) throw new HttpError(409, 'nothing_due', 'Ce client ne doit rien pour le moment.');
      if (input.amount > balance) {
        throw new HttpError(
          409,
          'overpayment',
          `Le client ne doit que ${balance} F. Le remboursement ne peut pas dépasser le solde.`,
          {
            amount: `Maximum : ${balance} F`,
          },
        );
      }
    }

    const [entry] = await tx
      .insert(entries)
      .values({
        merchantId: merchant.id,
        customerId: customer.id,
        type: input.type,
        amount: input.amount,
        note: input.note,
        dueDate: input.type === 'credit' ? input.dueDate : null,
        method: input.type === 'payment' ? input.method : null,
      })
      .returning();
    return entry!;
  });
}

export async function reverseEntry(db: DB, merchant: Merchant, entryId: string, reason: string | null) {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(entries)
      .where(and(eq(entries.id, entryId), eq(entries.merchantId, merchant.id)));
    if (!target) throw notFound('Opération');
    await lockCustomer(tx, target.customerId);

    const check = canReverse(target, await customerEntries(tx, target.customerId));
    if (!check.ok) throw new HttpError(409, 'cannot_reverse', check.reason);

    const [reversal] = await tx
      .insert(entries)
      .values({
        merchantId: merchant.id,
        customerId: target.customerId,
        type: 'reversal',
        amount: target.amount,
        note: reason,
        reversesId: target.id,
      })
      .returning();
    return reversal!;
  });
}

export async function archiveCustomer(db: DB, merchant: Merchant, customerId: string, archived: boolean) {
  const customer = await getOwnedCustomer(db, merchant.id, customerId);
  if (archived) {
    const { balance } = summarize(await customerEntries(db, customer.id), localDay());
    if (balance !== 0)
      throw new HttpError(409, 'balance_not_zero', 'On ne peut archiver qu’un client dont le solde est à zéro.');
  }
  await db
    .update(customers)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(customers.id, customer.id));
}

export async function publicStatement(db: DB, token: string) {
  const [row] = await db
    .select({ customer: customers, merchant: merchants })
    .from(customers)
    .innerJoin(merchants, eq(merchants.id, customers.merchantId))
    .where(eq(customers.shareToken, token));
  if (!row) throw notFound('Relevé');
  const list = await customerEntries(db, row.customer.id);
  const summary = summarize(list, localDay());
  // Le client voit les opérations effectives : les erreurs annulées n'ont pas à apparaître,
  // et le solde après chaque ligne est recalculé sans elles.
  return {
    row,
    summary,
    entries: history(effectiveEntries(list)).map(toEntryDto).reverse(),
  };
}
