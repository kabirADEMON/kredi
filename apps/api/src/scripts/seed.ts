import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/client.js';
import { merchants } from '../db/schema.js';
import { hashPin } from '../lib/security.js';
import { addSampleData } from '../services/sample.js';

// Compte d'exemple pour le développement : 01 00 00 00 01 / code 2580.
const PHONE = '0100000001';
const PIN = '2580';

const config = loadConfig();
const { db, close } = await openDatabase({ url: config.databaseUrl, pgliteDir: config.pgliteDir });

const [existing] = await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.phone, PHONE));
if (existing) await db.delete(merchants).where(eq(merchants.id, existing.id));

const [merchant] = await db
  .insert(merchants)
  .values({ shopName: 'Boutique Sika', ownerName: 'Sika Mensah', phone: PHONE, pinHash: await hashPin(PIN) })
  .returning();
await addSampleData(db, merchant!.id);

console.log(`Compte d'exemple prêt : téléphone 01 00 00 00 01, code PIN ${PIN}.`);
await close();
