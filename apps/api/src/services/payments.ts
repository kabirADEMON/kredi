import { eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { customers, entries, merchants, payments, type Payment } from '../db/schema.js';
import { localDay } from '../domain/dates.js';
import { summarize } from '../domain/ledger.js';
import { HttpError, notFound } from '../lib/errors.js';
import type { PaymentProvider, ProviderStatus } from '../payments/provider.js';
import { customerEntries, lockCustomer, publicStatement } from './ledger.js';

// Montant minimum accepté par les opérateurs Mobile Money.
export const MIN_MOMO_AMOUNT = 100;

export async function startPayment(db: DB, provider: PaymentProvider, appUrl: string, token: string, amount: number) {
  const { row, summary } = await publicStatement(db, token);
  if (summary.balance <= 0) throw new HttpError(409, 'nothing_due', 'Vous ne devez rien à cette boutique.');
  const min = Math.min(MIN_MOMO_AMOUNT, summary.balance);
  if (amount < min || amount > summary.balance) {
    throw new HttpError(400, 'bad_amount', `Le montant doit être compris entre ${min} F et ${summary.balance} F.`, {
      amount: `Entre ${min} F et ${summary.balance} F`,
    });
  }

  const [payment] = await db
    .insert(payments)
    .values({ merchantId: row.merchant.id, customerId: row.customer.id, amount, provider: provider.name })
    .returning();

  try {
    const checkout = await provider.createCheckout({
      paymentId: payment!.id,
      amount,
      description: `${row.merchant.shopName} - règlement de ${row.customer.name}`,
      returnUrl: `${appUrl}/paiement/${payment!.id}`,
    });
    await db
      .update(payments)
      .set({ providerRef: checkout.providerRef, updatedAt: new Date() })
      .where(eq(payments.id, payment!.id));
    return { paymentId: payment!.id, url: checkout.url };
  } catch (err) {
    await db.update(payments).set({ status: 'canceled', updatedAt: new Date() }).where(eq(payments.id, payment!.id));
    throw err;
  }
}

// Idempotent : un webhook rejoué, ou reçu en même temps que la vérification au retour
// du client, n'enregistre jamais deux fois le même remboursement.
export async function finalizePayment(
  db: DB,
  where: { id: string } | { providerRef: string },
  status: Exclude<ProviderStatus, 'pending'>,
): Promise<Payment | null> {
  return db.transaction(async (tx) => {
    const condition = 'id' in where ? eq(payments.id, where.id) : eq(payments.providerRef, where.providerRef);
    const [payment] = await tx.select().from(payments).where(condition).for('update');
    if (!payment) return null;
    if (payment.status !== 'pending') return payment;

    const [updated] = await tx
      .update(payments)
      .set({ status, updatedAt: new Date() })
      .where(eq(payments.id, payment.id))
      .returning();

    if (status === 'approved') {
      await lockCustomer(tx, payment.customerId);
      // L'argent est réellement reçu : on l'enregistre même si le solde a baissé entre-temps
      // (le surplus apparaît comme une avance du client).
      await tx.insert(entries).values({
        merchantId: payment.merchantId,
        customerId: payment.customerId,
        type: 'payment',
        amount: payment.amount,
        method: 'momo',
        note: 'Paiement Mobile Money',
        paymentId: payment.id,
      });
    }
    return updated!;
  });
}

export async function paymentStatus(db: DB, provider: PaymentProvider, paymentId: string) {
  const [row] = await db
    .select({ payment: payments, customer: customers, merchant: merchants })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .innerJoin(merchants, eq(merchants.id, payments.merchantId))
    .where(eq(payments.id, paymentId));
  if (!row) throw notFound('Paiement');

  let payment = row.payment;
  // Filet de sécurité : si le webhook n'est pas encore arrivé, on demande au prestataire.
  if (
    payment.status === 'pending' &&
    payment.providerRef &&
    provider.name === payment.provider &&
    provider.name !== 'mock'
  ) {
    const status = await provider.fetchStatus(payment.providerRef).catch(() => 'pending' as const);
    if (status !== 'pending') payment = (await finalizePayment(db, { id: payment.id }, status)) ?? payment;
  }

  const { balance } = summarize(await customerEntries(db, row.customer.id), localDay());
  return {
    id: payment.id,
    status: payment.status,
    amount: payment.amount,
    provider: payment.provider,
    shopName: row.merchant.shopName,
    customerName: row.customer.name,
    shareToken: row.customer.shareToken,
    balance,
  };
}
