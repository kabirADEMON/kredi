import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pwd: string, salt: Buffer, keylen: number) => Promise<Buffer>;

// Un code PIN a peu d'entropie : le hachage lent (scrypt) et le verrouillage après
// plusieurs échecs (voir routes/auth) sont tous les deux nécessaires.
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pin, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [algo, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64url');
  const actual = await scryptAsync(pin, Buffer.from(saltB64, 'base64url'), expected.length);
  return timingSafeEqual(actual, expected);
}

// 128 bits aléatoires : impossible à deviner, assez court pour un SMS.
export function newShareToken(): string {
  return randomBytes(16).toString('base64url');
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}
