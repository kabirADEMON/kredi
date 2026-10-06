import { randomInt } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { customers, entries, merchants, type Merchant } from '../db/schema.js';
import { localDay } from '../domain/dates.js';
import { hashPin, newShareToken } from '../lib/security.js';

const DAY = 86_400_000;

type Op =
  | { kind: 'credit'; daysAgo: number; amount: number; note: string; dueIn?: number }
  | { kind: 'payment'; daysAgo: number; amount: number; method?: 'cash' | 'momo'; note?: string }
  | { kind: 'reverse-last'; daysAgo: number; note: string };

// Une boutique de quartier à Cotonou : riz, huile, savon, recharges, ciment...
const SAMPLE: { name: string; phone: string | null; ops: Op[] }[] = [
  {
    name: 'Afi Houngbo',
    phone: '0197123456',
    ops: [
      { kind: 'credit', daysAgo: 24, amount: 12_500, note: 'Sac de riz 25 kg', dueIn: 14 },
      { kind: 'payment', daysAgo: 15, amount: 5_000 },
      { kind: 'credit', daysAgo: 6, amount: 3_500, note: 'Huile 5 L', dueIn: 10 },
    ],
  },
  {
    name: 'Koffi Agossou',
    phone: '0166554433',
    ops: [
      { kind: 'credit', daysAgo: 40, amount: 18_000, note: '3 sacs de ciment', dueIn: 21 },
      { kind: 'payment', daysAgo: 30, amount: 6_000 },
      { kind: 'credit', daysAgo: 12, amount: 2_000, note: 'Recharge MTN' },
    ],
  },
  {
    name: 'Mariam Bio Tchané',
    phone: '0161002030',
    ops: [
      { kind: 'credit', daysAgo: 20, amount: 7_500, note: 'Savon + lait en poudre', dueIn: 7 },
      { kind: 'payment', daysAgo: 9, amount: 7_500, method: 'momo', note: 'Paiement Mobile Money' },
      { kind: 'credit', daysAgo: 2, amount: 4_000, note: 'Pagne wax', dueIn: 12 },
    ],
  },
  {
    name: 'Rodrigue Dossou',
    phone: '0195887766',
    ops: [
      { kind: 'credit', daysAgo: 9, amount: 25_000, note: 'Tôles (erreur de saisie)' },
      { kind: 'reverse-last', daysAgo: 9, note: 'Mauvais client' },
      { kind: 'credit', daysAgo: 9, amount: 9_000, note: 'Pointes et fil de fer', dueIn: 15 },
    ],
  },
  {
    name: 'Sèna Ahouandjinou',
    phone: '0152443322',
    ops: [
      { kind: 'credit', daysAgo: 33, amount: 6_000, note: 'Gaz 6 kg', dueIn: 10 },
      { kind: 'payment', daysAgo: 18, amount: 6_000 },
    ],
  },
  {
    name: 'Fatou Sanni',
    phone: '0190909090',
    ops: [{ kind: 'credit', daysAgo: 3, amount: 1_500, note: 'Pain + sucre', dueIn: 4 }],
  },
  {
    name: 'Brice Zinsou',
    phone: null,
    ops: [
      { kind: 'credit', daysAgo: 16, amount: 4_500, note: 'Cahiers et stylos', dueIn: 5 },
      { kind: 'payment', daysAgo: 4, amount: 1_500 },
    ],
  },
];

export async function addSampleData(db: DB, merchantId: string, now = Date.now()) {
  for (const sample of SAMPLE) {
    const [customer] = await db
      .insert(customers)
      .values({
        merchantId,
        name: sample.name,
        phone: sample.phone,
        shareToken: newShareToken(),
        createdAt: new Date(now - (Math.max(...sample.ops.map((o) => o.daysAgo)) + 1) * DAY),
      })
      .returning();

    let lastId: string | null = null;
    let step = 0;
    for (const op of sample.ops) {
      // Pendant les heures d'ouverture (8 h - 19 h à Cotonou), pour un historique réaliste.
      const createdAt = new Date(now - op.daysAgo * DAY);
      step += 1;
      // Heures croissantes : une annulation reste toujours après l'opération qu'elle annule.
      createdAt.setUTCHours(7 + step * 2 + (sample.name.length % 3), (sample.name.length * 7 + step * 13) % 60, 0, 0);
      const base = { merchantId, customerId: customer!.id, createdAt };
      const values: typeof entries.$inferInsert =
        op.kind === 'credit'
          ? {
              ...base,
              type: 'credit' as const,
              amount: op.amount,
              note: op.note,
              dueDate: op.dueIn === undefined ? null : localDay(new Date(createdAt.getTime() + op.dueIn * DAY)),
            }
          : op.kind === 'payment'
            ? {
                ...base,
                type: 'payment' as const,
                amount: op.amount,
                method: op.method ?? 'cash',
                note: op.note ?? null,
              }
            : { ...base, type: 'reversal' as const, amount: 0, note: op.note, reversesId: lastId };

      if (values.type === 'reversal') {
        const [target] = await db.select().from(entries).where(eq(entries.id, lastId!));
        values.amount = target!.amount;
      }
      const [inserted] = await db.insert(entries).values(values).returning({ id: entries.id });
      lastId = inserted!.id as string;
    }
  }
}

// Démo publique : chaque visiteur reçoit sa propre boutique d'exemple, isolée des autres.
export async function createDemoMerchant(db: DB): Promise<Merchant> {
  const [merchant] = await db
    .insert(merchants)
    .values({
      shopName: 'Boutique Sika (démo)',
      ownerName: 'Sika Mensah',
      // Préfixe 00 : jamais un vrai numéro béninois, donc jamais en conflit avec un compte réel.
      phone: `00${String(randomInt(0, 1e8)).padStart(8, '0')}`,
      pinHash: await hashPin(String(randomInt(0, 1e9))),
      isDemo: true,
    })
    .returning();
  await addSampleData(db, merchant!.id);
  return merchant!;
}

export async function purgeOldDemos(db: DB, olderThanHours = 24) {
  const cutoff = new Date(Date.now() - olderThanHours * 3_600_000);
  await db.delete(merchants).where(and(eq(merchants.isDemo, true), lt(merchants.createdAt, cutoff)));
}
