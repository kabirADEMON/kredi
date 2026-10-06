import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextPhone, registeredAgent, setup, type TestApp } from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await setup({ DEMO_MODE: 'true' });
});
afterAll(() => t.close());

describe('inscription', () => {
  it('crée le carnet et ouvre la session', async () => {
    const { agent } = await registeredAgent(t.app, { phone: '97 11 22 33' });
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.merchant).toMatchObject({
      shopName: 'Boutique Test',
      phone: '0197112233',
      phoneDisplay: '01 97 11 22 33',
    });
  });

  it('refuse un numéro déjà inscrit, même écrit autrement', async () => {
    const phone = nextPhone();
    await registeredAgent(t.app, { phone });
    const res = await request(t.app)
      .post('/api/auth/register')
      .send({ shopName: 'Autre', ownerName: 'Autre', phone: `+229 ${phone}`, pin: '2580' })
      .expect(409);
    expect(res.body.error.code).toBe('phone_taken');
  });

  it('refuse un code PIN trop facile ou mal formé', async () => {
    for (const pin of ['1234', '0000', '12a4', '123']) {
      const res = await request(t.app)
        .post('/api/auth/register')
        .send({ shopName: 'Boutique', ownerName: 'Moi', phone: nextPhone(), pin })
        .expect(400);
      expect(res.body.error.fields.pin).toBeTruthy();
    }
  });

  it('valide chaque champ avec un message en français', async () => {
    const res = await request(t.app).post('/api/auth/register').send({ phone: '12' }).expect(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['ownerName', 'phone', 'pin', 'shopName']);
  });
});

describe('connexion', () => {
  it('connecte avec le bon code et refuse un mauvais', async () => {
    const { phone } = await registeredAgent(t.app);
    const agent = request.agent(t.app);
    const bad = await agent.post('/api/auth/login').send({ phone, pin: '9999' }).expect(401);
    expect(bad.body.error.message).toMatch(/4 essais restants/);
    await agent.post('/api/auth/login').send({ phone, pin: '2580' }).expect(200);
    await agent.get('/api/auth/me').expect(200);
  });

  it('ne révèle pas si un numéro existe', async () => {
    const res = await request(t.app).post('/api/auth/login').send({ phone: nextPhone(), pin: '2580' }).expect(401);
    expect(res.body.error.message).toBe('Numéro ou code PIN incorrect.');
  });

  it('verrouille le compte après 5 échecs, même avec le bon code ensuite', async () => {
    const { phone } = await registeredAgent(t.app);
    for (let i = 0; i < 4; i++) await request(t.app).post('/api/auth/login').send({ phone, pin: '1111' }).expect(401);
    const locked = await request(t.app).post('/api/auth/login').send({ phone, pin: '1111' }).expect(429);
    expect(locked.body.error.code).toBe('locked');
    await request(t.app).post('/api/auth/login').send({ phone, pin: '2580' }).expect(429);
  });

  it('remet le compteur à zéro après une connexion réussie', async () => {
    const { phone } = await registeredAgent(t.app);
    for (let i = 0; i < 4; i++) await request(t.app).post('/api/auth/login').send({ phone, pin: '1111' }).expect(401);
    await request(t.app).post('/api/auth/login').send({ phone, pin: '2580' }).expect(200);
    const res = await request(t.app).post('/api/auth/login').send({ phone, pin: '1111' }).expect(401);
    expect(res.body.error.message).toMatch(/4 essais restants/);
  });

  it('déconnecte', async () => {
    const { agent } = await registeredAgent(t.app);
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('refuse un cookie de session falsifié', async () => {
    await request(t.app).get('/api/customers').set('Cookie', 'kredi_session=abc.def.ghi').expect(401);
  });
});

describe('code PIN', () => {
  it('change le code et déconnecte les autres appareils', async () => {
    const { agent, phone } = await registeredAgent(t.app);
    const other = request.agent(t.app);
    await other.post('/api/auth/login').send({ phone, pin: '2580' }).expect(200);

    await agent.post('/api/merchant/pin').send({ currentPin: '0000', newPin: '7391' }).expect(400);
    await agent.post('/api/merchant/pin').send({ currentPin: '2580', newPin: '7391' }).expect(204);

    await agent.get('/api/auth/me').expect(200);
    await other.get('/api/auth/me').expect(401);
    await request(t.app).post('/api/auth/login').send({ phone, pin: '7391' }).expect(200);
  });
});

describe('démo', () => {
  it('donne à chaque visiteur sa propre boutique d’exemple', async () => {
    const a = request.agent(t.app);
    const b = request.agent(t.app);
    const ra = await a.post('/api/auth/demo').expect(201);
    const rb = await b.post('/api/auth/demo').expect(201);
    expect(ra.body.merchant.id).not.toBe(rb.body.merchant.id);
    expect(ra.body.merchant.isDemo).toBe(true);

    const list = await a.get('/api/customers').expect(200);
    expect(list.body.customers.length).toBeGreaterThan(3);
    await a.post('/api/merchant/pin').send({ currentPin: '2580', newPin: '7391' }).expect(403);
  });

  it('est désactivée par défaut', async () => {
    const plain = await setup();
    await request(plain.app).post('/api/auth/demo').expect(404);
    await plain.close();
  });
});

describe('sécurité HTTP', () => {
  it('refuse les corps non JSON sur les routes qui modifient', async () => {
    await request(t.app).post('/api/auth/login').type('form').send('phone=0197000000&pin=2580').expect(415);
  });

  it('envoie les en-têtes de sécurité', async () => {
    const res = await request(t.app).get('/api/health').expect(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
