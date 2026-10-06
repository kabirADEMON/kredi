import { z } from 'zod';
import { normalizeBeninPhone } from '../domain/phone.js';

export const phoneSchema = z
  .string({ error: 'Numéro requis.' })
  .trim()
  .transform((v, ctx) => {
    const phone = normalizeBeninPhone(v);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Numéro béninois invalide (ex. 01 97 12 34 56).' });
      return z.NEVER;
    }
    return phone;
  });

export const pinSchema = z
  .string({ error: 'Code PIN requis.' })
  .regex(/^\d{4}$/, 'Le code PIN fait 4 chiffres.')
  .refine((v) => !/^(\d)\1{3}$/.test(v) && !['1234', '4321', '0123'].includes(v), {
    message: 'Ce code est trop facile à deviner.',
  });

export const nameSchema = (label: string) =>
  z
    .string({ error: `${label} requis.` })
    .trim()
    .min(2, `${label} trop court.`)
    .max(80, `${label} trop long.`);

// Montant en F CFA : entier positif, plafonné pour éviter les fautes de frappe absurdes.
export const amountSchema = z.coerce
  .number({ error: 'Montant requis.' })
  .int('Le montant doit être un nombre entier de francs.')
  .positive('Le montant doit être positif.')
  .max(100_000_000, 'Montant trop élevé.');

export const optionalNote = z
  .string()
  .trim()
  .max(140, 'Note trop longue (140 caractères maximum).')
  .optional()
  .transform((v) => (v ? v : null));

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.');

export const uuidParam = z.string().uuid('Identifiant invalide.');
