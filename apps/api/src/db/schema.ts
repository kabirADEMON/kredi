import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const entryType = pgEnum('entry_type', ['credit', 'payment', 'reversal']);
export const paymentMethod = pgEnum('payment_method', ['cash', 'momo']);
export const paymentStatus = pgEnum('payment_status', ['pending', 'approved', 'declined', 'canceled']);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const merchants = pgTable('merchants', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopName: text('shop_name').notNull(),
  ownerName: text('owner_name').notNull(),
  phone: text('phone').notNull().unique(),
  pinHash: text('pin_hash').notNull(),
  // Incrémenté à chaque changement de code PIN : invalide les sessions ouvertes.
  sessionVersion: integer('session_version').notNull().default(1),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: createdAt(),
});

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone'),
    // Jeton du lien public « voir mon solde ». Révocable.
    shareToken: text('share_token').notNull().unique(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('customers_merchant_phone').on(t.merchantId, t.phone),
    index('customers_merchant_idx').on(t.merchantId),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref').unique(),
    status: paymentStatus('status').notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('payments_amount_positive', sql`${t.amount} > 0`)],
);

// Le carnet. Une opération n'est jamais modifiée ni supprimée : on l'annule par une
// opération « reversal » qui pointe vers elle.
export const entries = pgTable(
  'entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Ordre d'insertion : départage deux opérations saisies au même instant.
    seq: integer('seq').notNull().generatedAlwaysAsIdentity(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    type: entryType('type').notNull(),
    // Montant en francs CFA (entier : le franc CFA n'a pas de centimes).
    amount: integer('amount').notNull(),
    note: text('note'),
    dueDate: date('due_date'),
    method: paymentMethod('method'),
    reversesId: uuid('reverses_id')
      .unique()
      .references((): AnyPgColumn => entries.id),
    paymentId: uuid('payment_id')
      .unique()
      .references(() => payments.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('entries_amount_positive', sql`${t.amount} > 0`),
    check('entries_reversal_target', sql`(${t.type} = 'reversal') = (${t.reversesId} IS NOT NULL)`),
    index('entries_customer_idx').on(t.customerId, t.createdAt),
    index('entries_merchant_idx').on(t.merchantId, t.createdAt),
  ],
);

export type Merchant = typeof merchants.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type Payment = typeof payments.$inferSelect;
