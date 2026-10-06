import { Router } from 'express';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/client.js';
import { customers } from '../db/schema.js';
import { localDay } from '../domain/dates.js';
import { currentMerchant } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { newShareToken } from '../lib/security.js';
import { amountSchema, isoDate, nameSchema, optionalNote, phoneSchema, uuidParam } from '../lib/validation.js';
import {
  addEntry,
  archiveCustomer,
  customerDetail,
  getOwnedCustomer,
  listCustomers,
  reverseEntry,
} from '../services/ledger.js';

const CustomerBody = z.object({
  name: nameSchema('Nom du client'),
  phone: z
    .union([phoneSchema, z.literal('').transform(() => null), z.null()])
    .optional()
    .transform((v) => v ?? null),
});

const EntryBody = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('credit'),
    amount: amountSchema,
    note: optionalNote,
    dueDate: isoDate
      .nullish()
      .transform((v) => v ?? null)
      .refine((v) => v === null || v >= localDay(), 'L’échéance ne peut pas être dans le passé.'),
  }),
  z.object({
    type: z.literal('payment'),
    amount: amountSchema,
    note: optionalNote,
    method: z.enum(['cash', 'momo']).default('cash'),
  }),
]);

const ReverseBody = z.object({ reason: optionalNote });

export function customerRoutes(db: DB) {
  const r = Router();

  async function assertPhoneFree(merchantId: string, phone: string | null, exceptId?: string) {
    if (!phone) return;
    const conditions = [eq(customers.merchantId, merchantId), eq(customers.phone, phone)];
    if (exceptId) conditions.push(ne(customers.id, exceptId));
    const [dup] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(and(...conditions));
    if (dup) {
      throw new HttpError(409, 'phone_taken', `Ce numéro est déjà celui de ${dup.name}.`, {
        phone: `Déjà utilisé par ${dup.name}`,
      });
    }
  }

  r.get('/customers', async (req, res) => {
    const list = await listCustomers(db, currentMerchant(req).id);
    res.json({ customers: list });
  });

  r.post('/customers', async (req, res) => {
    const merchant = currentMerchant(req);
    const body = CustomerBody.parse(req.body);
    await assertPhoneFree(merchant.id, body.phone);
    const [customer] = await db
      .insert(customers)
      .values({ merchantId: merchant.id, name: body.name, phone: body.phone, shareToken: newShareToken() })
      .returning();
    res.status(201).json(await customerDetail(db, merchant.id, customer!.id));
  });

  r.get('/customers/:id', async (req, res) => {
    const id = uuidParam.parse(req.params.id);
    res.json(await customerDetail(db, currentMerchant(req).id, id));
  });

  r.patch('/customers/:id', async (req, res) => {
    const merchant = currentMerchant(req);
    const id = uuidParam.parse(req.params.id);
    const body = CustomerBody.parse(req.body);
    await getOwnedCustomer(db, merchant.id, id);
    await assertPhoneFree(merchant.id, body.phone, id);
    await db.update(customers).set({ name: body.name, phone: body.phone }).where(eq(customers.id, id));
    res.json(await customerDetail(db, merchant.id, id));
  });

  r.post('/customers/:id/archive', async (req, res) => {
    const merchant = currentMerchant(req);
    const id = uuidParam.parse(req.params.id);
    const { archived } = z.object({ archived: z.boolean() }).parse(req.body);
    await archiveCustomer(db, merchant, id, archived);
    res.json(await customerDetail(db, merchant.id, id));
  });

  // Nouveau lien public : l'ancien cesse de fonctionner (téléphone perdu, lien transféré...).
  r.post('/customers/:id/share-link', async (req, res) => {
    const merchant = currentMerchant(req);
    const id = uuidParam.parse(req.params.id);
    await getOwnedCustomer(db, merchant.id, id);
    await db.update(customers).set({ shareToken: newShareToken() }).where(eq(customers.id, id));
    res.json(await customerDetail(db, merchant.id, id));
  });

  r.post('/customers/:id/entries', async (req, res) => {
    const merchant = currentMerchant(req);
    const id = uuidParam.parse(req.params.id);
    const body = EntryBody.parse(req.body);
    await addEntry(db, merchant, id, body);
    res.status(201).json(await customerDetail(db, merchant.id, id));
  });

  r.post('/entries/:id/reverse', async (req, res) => {
    const merchant = currentMerchant(req);
    const id = uuidParam.parse(req.params.id);
    const { reason } = ReverseBody.parse(req.body ?? {});
    const reversal = await reverseEntry(db, merchant, id, reason);
    res.status(201).json(await customerDetail(db, merchant.id, reversal.customerId));
  });

  return r;
}
