import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FedaPayProvider } from '../src/payments/fedapay.js';
import { createCustomer, registeredAgent, setup, type TestApp } from './helpers.js';

async function debtor(app: TestApp['app'], amount = 7_500) {
  const { agent } = await registeredAgent(app);
  const { customer } = await createCustomer(agent, { name: 'Mariam Bio' });
  await agent.post(`/api/customers/${customer.id}/entries`).send({ type: 'credit', amount }).expect(201);
  return { agent, customer, token: customer.shareToken };
}

describe('relevé public', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  it('montre le solde et l’historique sans les erreurs annulées', async () => {
    const { agent, customer, token } = await debtor(t.app);
    const wrong = await agent
      .post(`/api/customers/${customer.id}/entries`)
      .send({ type: 'credit', amount: 99_000 })
      .expect(201);
    await agent.post(`/api/entries/${wrong.body.entries[0].id}/reverse`).send({}).expect(201);

    const res = await request(t.app).get(`/api/public/statements/${token}`).expect(200);
    expect(res.body).toMatchObject({
      customer: { name: 'Mariam Bio' },
      shop: { name: 'Boutique Test' },
      balance: 7_500,
    });
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0]).not.toHaveProperty('reversesId');
  });

  it('répond 404 à un lien inconnu ou mal formé', async () => {
    await request(t.app).get('/api/public/statements/AAAAAAAAAAAAAAAAAAAAAA').expect(404);
    await request(t.app).get('/api/public/statements/court').expect(404);
  });
});

describe('paiement Mobile Money simulé', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  it('enregistre le remboursement une seule fois quand le paiement est accepté', async () => {
    const { agent, customer, token } = await debtor(t.app);
    const start = await request(t.app)
      .post(`/api/public/statements/${token}/payments`)
      .send({ amount: 5_000 })
      .expect(201);
    expect(start.body.url).toBe(`http://kredi.test/paiement/simulation/${start.body.paymentId}`);

    const pending = await request(t.app).get(`/api/public/payments/${start.body.paymentId}`).expect(200);
    expect(pending.body).toMatchObject({ status: 'pending', amount: 5_000, balance: 7_500 });

    const sim = (outcome: string) =>
      request(t.app).post(`/api/public/payments/${start.body.paymentId}/simulate`).send({ outcome }).expect(200);
    expect((await sim('approved')).body).toMatchObject({ status: 'approved', balance: 2_500 });
    // Rejeu : rien ne change.
    expect((await sim('approved')).body).toMatchObject({ status: 'approved', balance: 2_500 });
    expect((await sim('declined')).body).toMatchObject({ status: 'approved', balance: 2_500 });

    const detail = await agent.get(`/api/customers/${customer.id}`).expect(200);
    expect(detail.body.entries[0]).toMatchObject({ type: 'payment', method: 'momo', viaMomo: true, amount: 5_000 });
    // Un paiement réellement reçu ne s'annule pas depuis le carnet.
    await agent.post(`/api/entries/${detail.body.entries[0].id}/reverse`).send({}).expect(409);
  });

  it('ne change rien quand le paiement est refusé', async () => {
    const { token } = await debtor(t.app);
    const start = await request(t.app)
      .post(`/api/public/statements/${token}/payments`)
      .send({ amount: 7_500 })
      .expect(201);
    const res = await request(t.app)
      .post(`/api/public/payments/${start.body.paymentId}/simulate`)
      .send({ outcome: 'declined' })
      .expect(200);
    expect(res.body).toMatchObject({ status: 'declined', balance: 7_500 });
  });

  it('borne le montant entre 100 F et le solde', async () => {
    const { token } = await debtor(t.app, 5_000);
    await request(t.app).post(`/api/public/statements/${token}/payments`).send({ amount: 50 }).expect(400);
    await request(t.app).post(`/api/public/statements/${token}/payments`).send({ amount: 5_001 }).expect(400);
    await request(t.app).post(`/api/public/statements/${token}/payments`).send({ amount: 5_000 }).expect(201);
  });

  it('refuse un paiement quand rien n’est dû', async () => {
    const { agent } = await registeredAgent(t.app);
    const { customer } = await createCustomer(agent);
    await request(t.app)
      .post(`/api/public/statements/${customer.shareToken}/payments`)
      .send({ amount: 500 })
      .expect(409);
  });

  it('n’expose pas de webhook FedaPay en mode simulation', async () => {
    await request(t.app).post('/api/webhooks/fedapay').set('Content-Type', 'application/json').send('{}').expect(404);
  });
});

describe('FedaPay', () => {
  const WEBHOOK_SECRET = 'wh_sandbox_test_secret';
  let t: TestApp;
  const calls: { method: string; url: string; body: unknown }[] = [];
  let remoteStatus = 'pending';
  let lastId = 4000;

  // Faux serveur FedaPay : on vérifie ce que Kredi envoie et on contrôle ce qu'il reçoit.
  const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ method: init?.method ?? 'GET', url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u.endsWith('/transactions') && init?.method === 'POST') return json({ 'v1/transaction': { id: ++lastId } });
    let m = u.match(/\/transactions\/(\d+)\/token$/);
    if (m) return json({ token: `tok${m[1]}`, url: `https://sandbox-checkout.fedapay.com/tok${m[1]}` });
    m = u.match(/\/transactions\/(\d+)$/);
    if (m) return json({ 'v1/transaction': { id: Number(m[1]), status: remoteStatus } });
    return new Response('not found', { status: 404 });
  });

  const provider = new FedaPayProvider({
    secretKey: 'sk_sandbox_test',
    webhookSecret: WEBHOOK_SECRET,
    env: 'sandbox',
    fetch: fakeFetch as unknown as typeof fetch,
  });

  const sign = (body: string, t = Math.floor(Date.now() / 1000), secret = WEBHOOK_SECRET) =>
    `t=${t},s=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

  beforeAll(async () => {
    t = await setup(
      { PAYMENT_PROVIDER: 'fedapay', FEDAPAY_SECRET_KEY: 'sk_sandbox_test', FEDAPAY_WEBHOOK_SECRET: WEBHOOK_SECRET },
      provider,
    );
  });
  afterAll(() => t.close());

  it('crée la transaction en F CFA et renvoie la page de paiement FedaPay', async () => {
    const { token } = await debtor(t.app);
    const res = await request(t.app)
      .post(`/api/public/statements/${token}/payments`)
      .send({ amount: 7_500 })
      .expect(201);
    expect(res.body.url).toBe(`https://sandbox-checkout.fedapay.com/tok${lastId}`);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://sandbox-api.fedapay.com/v1/transactions',
      body: {
        amount: 7_500,
        currency: { iso: 'XOF' },
        callback_url: `http://kredi.test/paiement/${res.body.paymentId}`,
      },
    });
    await request(t.app)
      .post(`/api/public/payments/${res.body.paymentId}/simulate`)
      .send({ outcome: 'approved' })
      .expect(404);
  });

  it('valide le paiement sur un webhook signé, une seule fois', async () => {
    const { agent, customer, token } = await debtor(t.app);
    const start = await request(t.app)
      .post(`/api/public/statements/${token}/payments`)
      .send({ amount: 7_500 })
      .expect(201);
    const body = JSON.stringify({ name: 'transaction.approved', entity: { id: lastId, status: 'approved' } });

    for (let i = 0; i < 2; i++) {
      await request(t.app)
        .post('/api/webhooks/fedapay')
        .set('Content-Type', 'application/json')
        .set('X-FEDAPAY-SIGNATURE', sign(body))
        .send(body)
        .expect(200);
    }
    const status = await request(t.app).get(`/api/public/payments/${start.body.paymentId}`).expect(200);
    expect(status.body).toMatchObject({ status: 'approved', balance: 0 });
    const detail = await agent.get(`/api/customers/${customer.id}`).expect(200);
    expect(detail.body.entries.filter((e: { type: string }) => e.type === 'payment')).toHaveLength(1);
  });

  it('rejette une signature fausse, absente ou trop ancienne', async () => {
    const body = JSON.stringify({ name: 'transaction.approved', entity: { id: lastId, status: 'approved' } });
    const post = (signature?: string) => {
      const req = request(t.app).post('/api/webhooks/fedapay').set('Content-Type', 'application/json');
      return (signature ? req.set('X-FEDAPAY-SIGNATURE', signature) : req).send(body);
    };
    await post().expect(400);
    await post(sign(body, undefined, 'wh_wrong')).expect(400);
    await post(sign(body, Math.floor(Date.now() / 1000) - 3_600)).expect(400);
    await post('t=abc,s=').expect(400);
  });

  it('interroge FedaPay au retour du client si le webhook n’est pas encore arrivé', async () => {
    const { token } = await debtor(t.app, 3_000);
    const start = await request(t.app)
      .post(`/api/public/statements/${token}/payments`)
      .send({ amount: 3_000 })
      .expect(201);
    remoteStatus = 'pending';
    expect((await request(t.app).get(`/api/public/payments/${start.body.paymentId}`)).body.status).toBe('pending');
    remoteStatus = 'approved';
    expect((await request(t.app).get(`/api/public/payments/${start.body.paymentId}`)).body).toMatchObject({
      status: 'approved',
      balance: 0,
    });
  });
});
