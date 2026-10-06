import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { DB } from '../db/client.js';
import { merchants, type Merchant } from '../db/schema.js';
import { formatBeninPhone } from '../domain/phone.js';
import { closeSession, currentMerchant, openSession, requireMerchant } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { hashPin, verifyPin } from '../lib/security.js';
import { nameSchema, phoneSchema, pinSchema } from '../lib/validation.js';
import { createDemoMerchant } from '../services/sample.js';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export function merchantDto(m: Merchant) {
  return {
    id: m.id,
    shopName: m.shopName,
    ownerName: m.ownerName,
    phone: m.isDemo ? null : m.phone,
    phoneDisplay: m.isDemo ? null : formatBeninPhone(m.phone),
    isDemo: m.isDemo,
    createdAt: m.createdAt.toISOString(),
  };
}

const RegisterBody = z.object({
  shopName: nameSchema('Nom de la boutique'),
  ownerName: nameSchema('Votre nom'),
  phone: phoneSchema,
  pin: pinSchema,
});

const LoginBody = z.object({
  phone: phoneSchema,
  pin: z.string().regex(/^\d{4}$/, 'Le code PIN fait 4 chiffres.'),
});

const INVALID_LOGIN = 'Numéro ou code PIN incorrect.';

export function authRoutes(db: DB, config: Config) {
  const r = Router();

  r.post('/register', async (req, res) => {
    const body = RegisterBody.parse(req.body);
    const [existing] = await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.phone, body.phone));
    if (existing) {
      throw new HttpError(409, 'phone_taken', 'Un carnet existe déjà avec ce numéro. Connectez-vous.', {
        phone: 'Numéro déjà utilisé',
      });
    }
    const [merchant] = await db
      .insert(merchants)
      .values({
        shopName: body.shopName,
        ownerName: body.ownerName,
        phone: body.phone,
        pinHash: await hashPin(body.pin),
      })
      .returning();
    openSession(res, config, merchant!);
    res.status(201).json({ merchant: merchantDto(merchant!) });
  });

  r.post('/login', async (req, res) => {
    const body = LoginBody.parse(req.body);
    const [merchant] = await db.select().from(merchants).where(eq(merchants.phone, body.phone));
    if (!merchant) {
      // Même coût qu'une vraie vérification : on ne révèle pas si le numéro existe.
      await hashPin(body.pin);
      throw new HttpError(401, 'invalid_credentials', INVALID_LOGIN);
    }

    if (merchant.lockedUntil && merchant.lockedUntil > new Date()) {
      const minutes = Math.ceil((merchant.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new HttpError(429, 'locked', `Trop d’essais. Réessayez dans ${minutes} min.`);
    }

    if (!(await verifyPin(body.pin, merchant.pinHash))) {
      const [updated] = await db
        .update(merchants)
        .set({ failedAttempts: sql`${merchants.failedAttempts} + 1` })
        .where(eq(merchants.id, merchant.id))
        .returning({ failedAttempts: merchants.failedAttempts });
      const attempts = updated!.failedAttempts;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await db
          .update(merchants)
          .set({ failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) })
          .where(eq(merchants.id, merchant.id));
        throw new HttpError(429, 'locked', `Trop d’essais. Réessayez dans ${LOCK_MINUTES} min.`);
      }
      const left = MAX_FAILED_ATTEMPTS - attempts;
      throw new HttpError(
        401,
        'invalid_credentials',
        `${INVALID_LOGIN} ${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}.`,
      );
    }

    await db.update(merchants).set({ failedAttempts: 0, lockedUntil: null }).where(eq(merchants.id, merchant.id));
    openSession(res, config, merchant);
    res.json({ merchant: merchantDto(merchant) });
  });

  r.post('/demo', async (_req, res) => {
    if (!config.demoMode) throw new HttpError(404, 'not_found', 'La démo n’est pas activée.');
    const merchant = await createDemoMerchant(db);
    openSession(res, config, merchant);
    res.status(201).json({ merchant: merchantDto(merchant) });
  });

  r.post('/logout', (_req, res) => {
    closeSession(res, config);
    res.status(204).end();
  });

  r.get('/me', requireMerchant(db, config), (req, res) => {
    res.json({ merchant: merchantDto(currentMerchant(req)) });
  });

  return r;
}
