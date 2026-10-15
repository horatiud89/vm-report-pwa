import { randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { STORE_850, allZones } from '@shared/store850';
import type { Country, Role, UserDoc } from '@shared/types';

export interface DemoAccount { tag: string; role: Role; country: Country | null; storeId: string | null; displayName: string }

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { tag: 'store850', role: 'store', country: 'CZ', storeId: '850', displayName: 'Store 850 Palladium Praha' },
  { tag: 'headofvm', role: 'head_vm', country: null, storeId: null, displayName: 'Head of VM' },
  { tag: 'director', role: 'director', country: null, storeId: null, displayName: 'Director of Operations' },
  { tag: 'avmcz', role: 'avm', country: 'CZ', storeId: null, displayName: 'Area VM CZ' },
  { tag: 'amcz', role: 'am', country: 'CZ', storeId: null, displayName: 'Area Manager CZ' },
];

/** 'a.b@gmail.com', 'store850' -> 'a.b+store850@gmail.com'. The message never includes the address. */
export function plusAddress(base: string, tag: string): string {
  if (!/^[^@\s+]+@[^@\s]+\.[^@\s]+$/.test(base)) throw new Error('Invalid base email: expected a name, an at-sign and a domain, with no plus sign in the name');
  const at = base.indexOf('@');
  return `${base.slice(0, at)}+${tag}${base.slice(at)}`;
}

/** 32 URL-safe characters (24 random bytes). Nobody ever types it: the demo users set their own through "Forgot password". */
const randomPassword = () => randomBytes(24).toString('base64url');

async function getOrCreateUser(auth: Auth, email: string, displayName: string): Promise<UserRecord> {
  try {
    return await auth.getUserByEmail(email);
  } catch (e) {
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
    return auth.createUser({ email, password: randomPassword(), displayName });
  }
}

/**
 * Creates store 850 and the demo accounts. Safe to run again: it converges everything to the definitions in code,
 * except the fields users change themselves (`language`, `fcmTokens`), which are only filled in when missing.
 */
export async function seed(opts: { db: Firestore; auth: Auth; baseEmail: string; log?: (line: string) => void }): Promise<void> {
  const { db, auth, baseEmail, log = () => {} } = opts;

  // set() overwrites on purpose, so a fixed zone list propagates.
  await db.doc(`stores/${STORE_850.id}`).set(STORE_850);
  log(`ok stores/${STORE_850.id} (${allZones(STORE_850).length} zones)`);

  for (const { tag, role, country, storeId, displayName } of DEMO_ACCOUNTS) {
    const email = plusAddress(baseEmail, tag);
    const { uid } = await getOrCreateUser(auth, email, displayName);
    await auth.setCustomUserClaims(uid, { role, country, storeId });

    // The rules let a user update language and fcmTokens only when both exist, so every users doc must have them.
    const ref = db.doc(`users/${uid}`);
    await db.runTransaction(async (tx) => {
      const existing = (await tx.get(ref)).data() as Partial<UserDoc> | undefined;
      const identity = { email, role, country, storeId, displayName };
      tx.set(ref, {
        ...identity,
        ...(existing?.language === undefined && { language: 'en' }),
        ...(existing?.fcmTokens === undefined && { fcmTokens: [] }),
      }, { merge: true });
    });
    log(`ok ${tag} (${role})`);
  }
}

async function main(): Promise<void> {
  const baseEmail = process.env.DEMO_EMAIL?.trim();
  if (!baseEmail) {
    console.error('DEMO_EMAIL is not set');
    process.exit(1);
  }
  initializeApp();
  await seed({ db: getFirestore(), auth: getAuth(), baseEmail, log: console.log });
}

// The bundle is CommonJS, where this is true only for `node lib/seed.js`. Importing the module (tests) must not run it.
if (typeof require !== 'undefined' && require.main === module) {
  main().catch((e: unknown) => {
    // Address-shaped text is masked: the account addresses are not GitHub secrets and the Actions log is public.
    console.error(`seed failed: ${(e instanceof Error ? e.message : String(e)).replace(/[^\s@]+@[^\s@]+/g, '<email>')}`);
    process.exit(1);
  });
}
