import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/client.js';
import type { PaymentProvider } from '../src/payments/provider.js';

export async function setup(env: Record<string, string> = {}, provider?: PaymentProvider) {
  const config = loadConfig({ NODE_ENV: 'test', APP_URL: 'http://kredi.test', JWT_SECRET: 'x'.repeat(40), ...env });
  const database = await openDatabase({});
  const app = createApp(database.db, config, provider);
  return { app, config, ...database };
}

export type TestApp = Awaited<ReturnType<typeof setup>>;

let phoneCounter = 10_000_000;
export const nextPhone = () => `01${phoneCounter++}`;

export async function registeredAgent(app: TestApp['app'], overrides: Record<string, string> = {}) {
  const agent = request.agent(app);
  const phone = overrides.phone ?? nextPhone();
  const res = await agent
    .post('/api/auth/register')
    .send({ shopName: 'Boutique Test', ownerName: 'Ama Test', phone, pin: '2580', ...overrides })
    .expect(201);
  return { agent, phone, merchant: res.body.merchant as { id: string } };
}

export async function createCustomer(
  agent: request.Agent,
  body: { name: string; phone?: string | null } = { name: 'Afi Client' },
) {
  const res = await agent.post('/api/customers').send(body).expect(201);
  return res.body as CustomerDetail;
}

export type CustomerDetail = {
  customer: {
    id: string;
    name: string;
    phone: string | null;
    balance: number;
    overdueAmount: number;
    shareToken: string;
    archived: boolean;
  };
  totals: { totalCredit: number; totalPaid: number };
  entries: {
    id: string;
    type: string;
    amount: number;
    reversed: boolean;
    balanceAfter: number;
    viaMomo: boolean;
    method: string | null;
  }[];
};
