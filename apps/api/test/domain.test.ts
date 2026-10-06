import { describe, expect, it } from 'vitest';
import { canReverse, history, summarize, type LedgerEntry } from '../src/domain/ledger.js';
import { formatBeninPhone, normalizeBeninPhone, toWhatsAppNumber } from '../src/domain/phone.js';

let seq = 0;
const at = (day: number) => new Date(Date.UTC(2026, 0, day, 10));
function entry(partial: Partial<LedgerEntry> & Pick<LedgerEntry, 'type' | 'amount'>): LedgerEntry {
  seq += 1;
  return { id: `e${seq}`, dueDate: null, createdAt: at(seq), seq, reversesId: null, paymentId: null, ...partial };
}

describe('summarize', () => {
  it('calcule le solde à partir des crédits et des remboursements', () => {
    const list = [
      entry({ type: 'credit', amount: 10_000 }),
      entry({ type: 'payment', amount: 3_000 }),
      entry({ type: 'credit', amount: 500 }),
    ];
    expect(summarize(list, '2026-02-01')).toMatchObject({ balance: 7_500, totalCredit: 10_500, totalPaid: 3_000 });
  });

  it('impute les remboursements aux crédits les plus anciens (FIFO) pour le retard', () => {
    const list = [
      entry({ type: 'credit', amount: 5_000, dueDate: '2026-01-10' }),
      entry({ type: 'credit', amount: 4_000, dueDate: '2026-01-20' }),
      entry({ type: 'credit', amount: 2_000, dueDate: '2026-03-01' }),
      entry({ type: 'payment', amount: 6_000 }),
    ];
    // 6 000 remboursés : le 1er crédit est soldé, il reste 3 000 sur le 2e (échu) et 2 000 à venir.
    const s = summarize(list, '2026-02-01');
    expect(s.balance).toBe(5_000);
    expect(s.overdueAmount).toBe(3_000);
    expect(s.oldestOverdueDate).toBe('2026-01-20');
    expect(s.nextDueDate).toBe('2026-03-01');
  });

  it("ne compte pas en retard un crédit dont l'échéance est aujourd'hui", () => {
    const s = summarize([entry({ type: 'credit', amount: 1_000, dueDate: '2026-02-01' })], '2026-02-01');
    expect(s.overdueAmount).toBe(0);
    expect(s.nextDueDate).toBe('2026-02-01');
  });

  it('ignore les opérations annulées et les annulations', () => {
    const wrong = entry({ type: 'credit', amount: 25_000, dueDate: '2026-01-02' });
    const list = [
      wrong,
      entry({ type: 'reversal', amount: 25_000, reversesId: wrong.id }),
      entry({ type: 'credit', amount: 1_000 }),
    ];
    expect(summarize(list, '2026-02-01')).toMatchObject({ balance: 1_000, overdueAmount: 0, totalCredit: 1_000 });
  });

  it('renvoie un solde négatif (avance) si le client a trop payé', () => {
    const list = [entry({ type: 'credit', amount: 1_000 }), entry({ type: 'payment', amount: 1_500 })];
    expect(summarize(list, '2026-02-01').balance).toBe(-500);
  });

  it('départage deux opérations au même instant par leur ordre de saisie', () => {
    const same = new Date(Date.UTC(2026, 0, 5));
    const a = entry({ type: 'credit', amount: 2_000, createdAt: same, seq: 2 });
    const b = entry({ type: 'payment', amount: 500, createdAt: same, seq: 1 });
    expect(history([a, b]).map((l) => l.id)).toEqual([b.id, a.id]);
  });
});

describe('history', () => {
  it("donne le solde après chaque opération, l'annulation inversant la cible", () => {
    const credit = entry({ type: 'credit', amount: 5_000 });
    const payment = entry({ type: 'payment', amount: 2_000 });
    const reversal = entry({ type: 'reversal', amount: 2_000, reversesId: payment.id });
    const lines = history([reversal, credit, payment]);
    expect(lines.map((l) => l.balanceAfter)).toEqual([5_000, 3_000, 5_000]);
    expect(lines.map((l) => l.reversed)).toEqual([false, true, false]);
  });
});

describe('canReverse', () => {
  it('refuse une double annulation', () => {
    const credit = entry({ type: 'credit', amount: 5_000 });
    const list = [credit, entry({ type: 'reversal', amount: 5_000, reversesId: credit.id })];
    expect(canReverse(credit, list).ok).toBe(false);
  });

  it("refuse d'annuler une annulation", () => {
    const credit = entry({ type: 'credit', amount: 5_000 });
    const reversal = entry({ type: 'reversal', amount: 5_000, reversesId: credit.id });
    expect(canReverse(reversal, [credit, reversal]).ok).toBe(false);
  });

  it('refuse un crédit dont l’annulation rendrait le solde négatif', () => {
    const credit = entry({ type: 'credit', amount: 5_000 });
    const list = [credit, entry({ type: 'payment', amount: 4_000 })];
    expect(canReverse(credit, list)).toMatchObject({ ok: false });
  });

  it('refuse un paiement Mobile Money reçu', () => {
    const credit = entry({ type: 'credit', amount: 5_000 });
    const momo = entry({ type: 'payment', amount: 5_000, paymentId: 'p1' });
    expect(canReverse(momo, [credit, momo]).ok).toBe(false);
  });

  it('accepte un remboursement en espèces saisi par erreur', () => {
    const credit = entry({ type: 'credit', amount: 5_000 });
    const cash = entry({ type: 'payment', amount: 5_000 });
    expect(canReverse(cash, [credit, cash]).ok).toBe(true);
  });
});

describe('numéros béninois', () => {
  it.each([
    ['01 97 12 34 56', '0197123456'],
    ['+229 01 97 12 34 56', '0197123456'],
    ['00229 0197123456', '0197123456'],
    ['22997123456', '0197123456'],
    ['97 12 34 56', '0197123456'],
    ['97-12-34-56', '0197123456'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeBeninPhone(input)).toBe(expected);
  });

  it.each(['', '123', '02 97 12 34 56', 'abcdefgh', '+33 6 12 34 56 78'])('refuse %s', (input) => {
    expect(normalizeBeninPhone(input)).toBeNull();
  });

  it('formate pour l’affichage et pour WhatsApp', () => {
    expect(formatBeninPhone('0197123456')).toBe('01 97 12 34 56');
    expect(toWhatsAppNumber('0197123456')).toBe('2290197123456');
  });
});
