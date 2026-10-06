import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import type { Config } from '../config.js';
import type { DB } from '../db/client.js';
import { merchants, type Merchant } from '../db/schema.js';
import { HttpError } from './errors.js';

export const SESSION_COOKIE = 'kredi_session';
const SESSION_DAYS = 30;

type Claims = { sub: string; sv: number };

declare module 'express-serve-static-core' {
  interface Request {
    merchant?: Merchant;
  }
}

function cookieOptions(config: Config): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
    path: '/',
  };
}

export function openSession(res: Response, config: Config, merchant: Merchant) {
  const token = jwt.sign({ sv: merchant.sessionVersion } satisfies Omit<Claims, 'sub'>, config.jwtSecret, {
    subject: merchant.id,
    expiresIn: `${SESSION_DAYS}d`,
    algorithm: 'HS256',
  });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(config), maxAge: SESSION_DAYS * 86_400_000 });
}

export function closeSession(res: Response, config: Config) {
  res.clearCookie(SESSION_COOKIE, cookieOptions(config));
}

export function requireMerchant(db: DB, config: Config) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string') throw new HttpError(401, 'unauthenticated', 'Connectez-vous pour continuer.');

    let claims: Claims;
    try {
      claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as Claims;
    } catch {
      throw new HttpError(401, 'unauthenticated', 'Votre session a expiré. Reconnectez-vous.');
    }

    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, claims.sub));
    // Un changement de code PIN invalide toutes les sessions ouvertes ailleurs.
    if (!merchant || merchant.sessionVersion !== claims.sv) {
      throw new HttpError(401, 'unauthenticated', 'Votre session a expiré. Reconnectez-vous.');
    }
    req.merchant = merchant;
    next();
  };
}

export function currentMerchant(req: Request): Merchant {
  if (!req.merchant) throw new HttpError(401, 'unauthenticated', 'Connectez-vous pour continuer.');
  return req.merchant;
}
