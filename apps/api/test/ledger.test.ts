import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localDay } from '../src/domain/dates.js';
import { createCustomer, registeredAgent, setup, type CustomerDetail, type TestApp } from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

const tomorrow = () => localDay(new Date(Date.now() + 86_400_000));

describe('clients', () => {
  it('crée, liste et modifie un client', async () => {
    const { agent } = await registeredAgent(t.app);
    const created = await createCustomer(agent, { name: '  Koffi Agossou ', phone: '66 55 44 33' });
    expect(created.customer).toMatchObject({ name: 'Koffi Agossou', phone: '0166554433', balance: 0 });
    expect(created.customer.shareToken).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const list = await agent.get('/api/customers').expect(200);
    expect(list.body.customers).toHaveLength(1);

    const updated = await agent
      .patch(`/api/customers/${created.customer.id}`)
      .send({ name: 'Koffi A.', phone: '' })
      .expect(200);
    expect(updated.body.customer).toMatchObject({ name: 'Koffi A.', phone: null });
  });

  it('accepte un client sans numéro mais refuse un numéro en double', async () => {
    const { agent } = await registeredAgent(t.app);
    await createCustomer(agent, { name: 'Sans numéro' });
    await createCustomer(agent, { name: 'Autre sans numéro', phone: null });
    await createCustomer(agent, { name: 'Afi', phone: '0197123456' });
    const dup = await agent.post('/api/customers').send({ name: 'Afi bis', phone: '+229 97 12 34 56' }).expect(409);
    expect(dup.body.error.message).toContain('Afi');
  });

  it('isole les carnets : un commerçant ne voit jamais les clients d’un autre', async () => {
    const a = await registeredAgent(t.app);
    const b = await registeredAgent(t.app);
    const theirs = await createCustomer(a.agent, { name: 'Client de A' });
    await b.agent.get(`/api/customers/${theirs.customer.id}`).expect(404);
    await b.agent
      .post(`/api/customers/${theirs.customer.id}/entries`)
      .send({ type: 'credit', amount: 100 })
      .expect(404);
    const list = await b.agent.get('/api/customers').expect(200);
    expect(list.body.customers).toHaveLength(0);
  });

  it('exige une session', async () => {
    await request(t.app).get('/api/customers').expect(401);
    await request(t.app).get('/api/dashboard').expect(401);
  });

  it('répond 400 à un identifiant mal formé', async () => {
    const { agent } = await registeredAgent(t.app);
    await agent.get('/api/customers/pas-un-uuid').expect(400);
  });
});

describe('opérations', () => {
  async function withCustomer() {
    const { agent } = await registeredAgent(t.app);
    const { customer } = await createCustomer(agent);
    const post = (body: object, status = 201) =>
      agent
        .post(`/api/customers/${customer.id}/entries`)
        .send(body)
        .expect(status)
        .then((r) => r.body as CustomerDetail);
    return { agent, customer, post };
  }

  it('note crédits et remboursements, avec le solde après chaque ligne', async () => {
    const { post } = await withCustomer();
    await post({ type: 'credit', amount: 12_500, note: 'Sac de riz 25 kg', dueDate: tomorrow() });
    await post({ type: 'payment', amount: 5_000, method: 'cash' });
    const detail = await post({ type: 'credit', amount: '3500', note: '' });

    expect(detail.customer.balance).toBe(11_000);
    expect(detail.totals).toEqual({ totalCredit: 16_000, totalPaid: 5_000 });
    // Du plus récent au plus ancien.
    expect(detail.entries.map((e) => [e.type, e.amount, e.balanceAfter])).toEqual([
      ['credit', 3_500, 11_000],
      ['payment', 5_000, 7_500],
      ['credit', 12_500, 12_500],
    ]);
  });

  it('refuse les montants invalides et les échéances passées', async () => {
    const { post } = await withCustomer();
    for (const amount of [0, -5, 12.5, 'abc', 200_000_000]) {
      const body = (await post({ type: 'credit', amount }, 400)) as unknown as {
        error: { fields: Record<string, string> };
      };
      expect(body.error.fields.amount).toBeTruthy();
    }
    await post({ type: 'credit', amount: 1_000, dueDate: '2020-01-01' }, 400);
    await post({ type: 'loan', amount: 1_000 }, 400);
  });

  it('refuse un remboursement supérieur au solde', async () => {
    const { post } = await withCustomer();
    await post({ type: 'payment', amount: 500 }, 409);
    await post({ type: 'credit', amount: 2_000 });
    const res = (await post({ type: 'payment', amount: 2_001 }, 409)) as unknown as { error: { code: string } };
    expect(res.error.code).toBe('overpayment');
    const ok = await post({ type: 'payment', amount: 2_000 });
    expect(ok.customer.balance).toBe(0);
  });

  it('ne perd aucune opération quand deux saisies arrivent en même temps', async () => {
    const { agent, customer, post } = await withCustomer();
    await post({ type: 'credit', amount: 1_000 });
    // Deux remboursements de 1 000 simultanés : un seul doit passer.
    const results = await Promise.all([
      agent.post(`/api/customers/${customer.id}/entries`).send({ type: 'payment', amount: 1_000 }),
      agent.post(`/api/customers/${customer.id}/entries`).send({ type: 'payment', amount: 1_000 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const detail = await agent.get(`/api/customers/${customer.id}`).expect(200);
    expect(detail.body.customer.balance).toBe(0);
  });

  it('annule une opération sans jamais la supprimer', async () => {
    const { agent, post } = await withCustomer();
    await post({ type: 'credit', amount: 25_000, note: 'Erreur' });
    const before = await post({ type: 'credit', amount: 9_000 });
    const wrong = before.entries.find((e) => e.amount === 25_000)!;

    const after = await agent.post(`/api/entries/${wrong.id}/reverse`).send({ reason: 'Mauvais client' }).expect(201);
    const body = after.body as CustomerDetail;
    expect(body.customer.balance).toBe(9_000);
    expect(body.entries).toHaveLength(3);
    expect(body.entries.find((e) => e.id === wrong.id)!.reversed).toBe(true);
    expect(body.entries[0]!.type).toBe('reversal');

    await agent.post(`/api/entries/${wrong.id}/reverse`).send({}).expect(409);
    await agent.post(`/api/entries/${body.entries[0]!.id}/reverse`).send({}).expect(409);
  });

  it('refuse d’annuler un crédit déjà remboursé (solde négatif)', async () => {
    const { agent, post } = await withCustomer();
    await post({ type: 'credit', amount: 5_000 });
    const paid = await post({ type: 'payment', amount: 5_000 });
    const credit = paid.entries.find((e) => e.type === 'credit')!;
    const res = await agent.post(`/api/entries/${credit.id}/reverse`).send({}).expect(409);
    expect(res.body.error.message).toMatch(/remboursement/);
  });

  it('archive seulement un client à zéro, et bloque les saisies une fois archivé', async () => {
    const { agent, customer, post } = await withCustomer();
    await post({ type: 'credit', amount: 1_000 });
    await agent.post(`/api/customers/${customer.id}/archive`).send({ archived: true }).expect(409);
    await post({ type: 'payment', amount: 1_000 });
    const archived = await agent.post(`/api/customers/${customer.id}/archive`).send({ archived: true }).expect(200);
    expect(archived.body.customer.archived).toBe(true);
    await post({ type: 'credit', amount: 500 }, 409);
    await agent.post(`/api/customers/${customer.id}/archive`).send({ archived: false }).expect(200);
    await post({ type: 'credit', amount: 500 });
  });

  it('renouvelle le lien public et coupe l’ancien', async () => {
    const { agent, customer } = await withCustomer();
    await request(t.app).get(`/api/public/statements/${customer.shareToken}`).expect(200);
    const res = await agent.post(`/api/customers/${customer.id}/share-link`).expect(200);
    expect(res.body.customer.shareToken).not.toBe(customer.shareToken);
    await request(t.app).get(`/api/public/statements/${customer.shareToken}`).expect(404);
    await request(t.app).get(`/api/public/statements/${res.body.customer.shareToken}`).expect(200);
  });
});

describe('tableau de bord et export', () => {
  it('additionne ce qui est dû, en retard et encaissé ce mois-ci', async () => {
    const { agent } = await registeredAgent(t.app);
    const a = await createCustomer(agent, { name: 'Afi' });
    const b = await createCustomer(agent, { name: 'Brice' });
    await createCustomer(agent, { name: 'Chantal' });
    const add = (id: string, body: object) => agent.post(`/api/customers/${id}/entries`).send(body).expect(201);
    await add(a.customer.id, { type: 'credit', amount: 10_000, dueDate: tomorrow() });
    await add(a.customer.id, { type: 'payment', amount: 4_000 });
    await add(b.customer.id, { type: 'credit', amount: 2_500 });

    const res = await agent.get('/api/dashboard').expect(200);
    expect(res.body).toMatchObject({
      totalDue: 8_500,
      debtorsCount: 2,
      overdueAmount: 0,
      collectedThisMonth: 4_000,
      creditedThisMonth: 12_500,
      customersCount: 3,
    });
    expect(res.body.recent[0]).toMatchObject({ customerName: 'Brice', type: 'credit', amount: 2_500 });
  });

  it('exporte un CSV lisible par Excel et sans injection de formule', async () => {
    const { agent } = await registeredAgent(t.app);
    const c = await createCustomer(agent, { name: '=HYPERLINK("x")', phone: '0197000001' });
    await agent.post(`/api/customers/${c.customer.id}/entries`).send({ type: 'credit', amount: 1_500 }).expect(201);
    const res = await agent.get('/api/export/clients.csv').expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/kredi-clients-\d{4}-\d{2}-\d{2}\.csv/);
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain(`"'=HYPERLINK(""x"")";01 97 00 00 01;1500;0;;non`);
  });
});
