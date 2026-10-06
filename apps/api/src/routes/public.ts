import express, { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db/client.js';
import { formatBeninPhone } from '../domain/phone.js';
import { HttpError, notFound } from '../lib/errors.js';
import { amountSchema, uuidParam } from '../lib/validation.js';
import type { PaymentProvider } from '../payments/provider.js';
import { publicStatement } from '../services/ledger.js';
import { finalizePayment, MIN_MOMO_AMOUNT, paymentStatus, startPayment } from '../services/payments.js';

const tokenParam = z.string().regex(/^[A-Za-z0-9_-]{22}$/, 'Lien invalide.');

// Routes sans compte : le relevé que le client ouvre depuis WhatsApp, et le paiement.
export function publicRoutes(db: DB, provider: PaymentProvider, appUrl: string) {
  const r = Router();

  r.get('/statements/:token', async (req, res) => {
    const parsed = tokenParam.safeParse(req.params.token);
    if (!parsed.success) throw notFound('Relevé');
    const { row, summary, entries } = await publicStatement(db, parsed.data);
    res.json({
      shop: {
        name: row.merchant.shopName,
        ownerName: row.merchant.ownerName,
        phone: row.merchant.isDemo ? null : row.merchant.phone,
        phoneDisplay: row.merchant.isDemo ? null : formatBeninPhone(row.merchant.phone),
      },
      customer: { name: row.customer.name },
      balance: summary.balance,
      overdueAmount: summary.overdueAmount,
      nextDueDate: summary.nextDueDate,
      entries: entries.map(({ id, type, amount, note, dueDate, method, createdAt, balanceAfter }) => ({
        id,
        type,
        amount,
        note,
        dueDate,
        method,
        createdAt,
        balanceAfter,
      })),
      payment: { provider: provider.name, minAmount: Math.min(MIN_MOMO_AMOUNT, Math.max(summary.balance, 0)) },
    });
  });

  r.post('/statements/:token/payments', async (req, res) => {
    const parsed = tokenParam.safeParse(req.params.token);
    if (!parsed.success) throw notFound('Relevé');
    const { amount } = z.object({ amount: amountSchema }).parse(req.body);
    res.status(201).json(await startPayment(db, provider, appUrl, parsed.data, amount));
  });

  r.get('/payments/:id', async (req, res) => {
    res.json(await paymentStatus(db, provider, uuidParam.parse(req.params.id)));
  });

  // Page de paiement simulée (développement et démo uniquement).
  r.post('/payments/:id/simulate', async (req, res) => {
    if (provider.name !== 'mock') throw notFound();
    const id = uuidParam.parse(req.params.id);
    const { outcome } = z.object({ outcome: z.enum(['approved', 'declined']) }).parse(req.body);
    const payment = await finalizePayment(db, { id }, outcome);
    if (!payment) throw notFound('Paiement');
    res.json(await paymentStatus(db, provider, id));
  });

  return r;
}

// Le webhook a besoin du corps brut pour vérifier la signature : on le monte avant express.json().
export function webhookRoutes(db: DB, provider: PaymentProvider) {
  const r = Router();
  r.post('/fedapay', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
    if (provider.name !== 'fedapay') throw notFound();
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!raw) throw new HttpError(400, 'empty', 'Corps vide.');
    const event = provider.parseWebhook(raw, req.headers);
    if (event && event.status !== 'pending') {
      await finalizePayment(db, { providerRef: event.providerRef }, event.status);
    }
    res.json({ received: true });
  });
  return r;
}
