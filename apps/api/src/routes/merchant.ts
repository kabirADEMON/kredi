import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { DB } from '../db/client.js';
import { merchants } from '../db/schema.js';
import { localDay } from '../domain/dates.js';
import { formatBeninPhone } from '../domain/phone.js';
import { currentMerchant, openSession } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { hashPin, verifyPin } from '../lib/security.js';
import { nameSchema, pinSchema } from '../lib/validation.js';
import { dashboard, listCustomers } from '../services/ledger.js';
import { merchantDto } from './auth.js';

const ProfileBody = z.object({
  shopName: nameSchema('Nom de la boutique'),
  ownerName: nameSchema('Votre nom'),
});

const PinBody = z.object({
  currentPin: z.string().regex(/^\d{4}$/, 'Code actuel invalide.'),
  newPin: pinSchema,
});

// Champs CSV : guillemets doublés, et neutralisation des formules (=, +, -, @) pour Excel.
function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function merchantRoutes(db: DB, config: Config) {
  const r = Router();

  r.get('/dashboard', async (req, res) => {
    res.json(await dashboard(db, currentMerchant(req).id));
  });

  r.patch('/merchant', async (req, res) => {
    const merchant = currentMerchant(req);
    const body = ProfileBody.parse(req.body);
    const [updated] = await db.update(merchants).set(body).where(eq(merchants.id, merchant.id)).returning();
    res.json({ merchant: merchantDto(updated!) });
  });

  r.post('/merchant/pin', async (req, res) => {
    const merchant = currentMerchant(req);
    if (merchant.isDemo) throw new HttpError(403, 'demo', 'Le code PIN ne se change pas en mode démo.');
    const body = PinBody.parse(req.body);
    if (!(await verifyPin(body.currentPin, merchant.pinHash))) {
      throw new HttpError(400, 'wrong_pin', 'Le code actuel est incorrect.', { currentPin: 'Code incorrect' });
    }
    // Nouvelle version de session : les autres appareils connectés sont déconnectés.
    const [updated] = await db
      .update(merchants)
      .set({ pinHash: await hashPin(body.newPin), sessionVersion: sql`${merchants.sessionVersion} + 1` })
      .where(eq(merchants.id, merchant.id))
      .returning();
    openSession(res, config, updated!);
    res.status(204).end();
  });

  r.get('/export/clients.csv', async (req, res) => {
    const merchant = currentMerchant(req);
    const list = await listCustomers(db, merchant.id);
    const header = [
      'Client',
      'Téléphone',
      'Solde (F CFA)',
      'En retard (F CFA)',
      'Plus ancienne échéance dépassée',
      'Archivé',
    ];
    const rows = list
      .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, 'fr'))
      .map((c) => [
        c.name,
        c.phone ? formatBeninPhone(c.phone) : null,
        c.balance,
        c.overdueAmount,
        c.oldestOverdueDate,
        c.archived ? 'oui' : 'non',
      ]);
    // BOM + point-virgule : s'ouvre correctement dans Excel en français.
    const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
    res.type('text/csv; charset=utf-8').attachment(`kredi-clients-${localDay()}.csv`).send(csv);
  });

  return r;
}
