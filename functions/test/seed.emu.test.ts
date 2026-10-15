import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, test } from 'vitest';
import { STORE_850, allZones } from '@shared/store850';
import type { UserDoc } from '@shared/types';
import { DEMO_ACCOUNTS, plusAddress, seed } from '../src/seed';
import { PROJECT_ID } from './helpers';

// The emulators need no credentials; skip the GCE metadata probe google-auth-library would otherwise run (and warn about).
process.env.METADATA_SERVER_DETECTION ??= 'none';

const BASE = 'seed.tester@example.com';
const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);
const auth = getAuth(app);

const run = (log?: (line: string) => void) => seed({ db, auth, baseEmail: BASE, log });
const userByTag = (tag: string) => auth.getUserByEmail(plusAddress(BASE, tag));
const userDoc = async (uid: string) => (await db.doc(`users/${uid}`).get()).data() as UserDoc;

beforeEach(async () => {
  const { users } = await auth.listUsers();
  await auth.deleteUsers(users.map((u) => u.uid));
  await Promise.all(['stores', 'users'].map((name) => db.recursiveDelete(db.collection(name))));
});

describe('plusAddress', () => {
  test('inserts the tag before the @', () => {
    expect(plusAddress('x@gmail.com', 'amcz')).toBe('x+amcz@gmail.com');
    expect(plusAddress('a.b@gmail.com', 'store850')).toBe('a.b+store850@gmail.com');
  });

  test.each(['nope', 'a+b@gmail.com', '@gmail.com', 'a@b', 'a b@gmail.com', 'a@@gmail.com', ''])('throws on invalid base %j', (base) => {
    expect(() => plusAddress(base, 'tag')).toThrow(Error);
  });

  test('the error never contains the address', () => {
    expect(() => plusAddress('secret+x@gmail.com', 'tag')).toThrow(/^(?!.*secret)/);
  });
});

test('DEMO_ACCOUNTS lists the five demo accounts', () => {
  expect(DEMO_ACCOUNTS).toEqual([
    { tag: 'store850', role: 'store', country: 'CZ', storeId: '850', displayName: 'Store 850 Palladium Praha' },
    { tag: 'headofvm', role: 'head_vm', country: null, storeId: null, displayName: 'Head of VM' },
    { tag: 'director', role: 'director', country: null, storeId: null, displayName: 'Director of Operations' },
    { tag: 'avmcz', role: 'avm', country: 'CZ', storeId: null, displayName: 'Area VM CZ' },
    { tag: 'amcz', role: 'am', country: 'CZ', storeId: null, displayName: 'Area Manager CZ' },
  ]);
});

describe('seed', () => {
  test('writes stores/850 with its 33 zones', async () => {
    await run();
    const store = (await db.doc('stores/850').get()).data();
    expect(store).toEqual(STORE_850);
    expect(allZones(store as typeof STORE_850)).toHaveLength(33);
  });

  test('creates the five Auth users with the exact custom claims', async () => {
    await run();
    expect((await auth.listUsers()).users).toHaveLength(5);
    for (const a of DEMO_ACCOUNTS) {
      const user = await userByTag(a.tag);
      expect(user.displayName).toBe(a.displayName);
      expect(user.customClaims).toEqual({ role: a.role, country: a.country, storeId: a.storeId });
    }
  });

  test('writes users/{uid} with identity fields, language en and no push tokens', async () => {
    await run();
    for (const a of DEMO_ACCOUNTS) {
      const user = await userByTag(a.tag);
      expect(await userDoc(user.uid)).toEqual({
        email: plusAddress(BASE, a.tag), role: a.role, country: a.country, storeId: a.storeId,
        displayName: a.displayName, language: 'en', fcmTokens: [],
      });
    }
  });

  test('running twice keeps five users and their uids', async () => {
    await run();
    const first = await Promise.all(DEMO_ACCOUNTS.map(async (a) => (await userByTag(a.tag)).uid));
    await run();
    expect((await auth.listUsers()).users).toHaveLength(5);
    expect(await Promise.all(DEMO_ACCOUNTS.map(async (a) => (await userByTag(a.tag)).uid))).toEqual(first);
    expect((await db.collection('users').get()).size).toBe(5);
  });

  test('a re-run preserves a changed language and the push tokens', async () => {
    await run();
    const { uid } = await userByTag('store850');
    await db.doc(`users/${uid}`).update({ language: 'cs', fcmTokens: ['tok-1', 'tok-2'] });
    await run();
    const doc = await userDoc(uid);
    expect(doc.language).toBe('cs');
    expect(doc.fcmTokens).toEqual(['tok-1', 'tok-2']);
  });

  test('a re-run restores identity fields that were changed', async () => {
    await run();
    const { uid } = await userByTag('amcz');
    await db.doc(`users/${uid}`).update({ role: 'director', country: null, storeId: '999', displayName: 'Someone', email: 'x@example.com' });
    await run();
    expect(await userDoc(uid)).toMatchObject({
      email: plusAddress(BASE, 'amcz'), role: 'am', country: 'CZ', storeId: null, displayName: 'Area Manager CZ',
    });
  });

  test('a deleted users doc is recreated with language en and empty fcmTokens', async () => {
    await run();
    const { uid } = await userByTag('director');
    await db.doc(`users/${uid}`).delete();
    await run();
    const doc = await userDoc(uid);
    expect(doc.language).toBe('en');
    expect(doc.fcmTokens).toEqual([]);
  });

  test('a users doc missing only one of language and fcmTokens gets only that field', async () => {
    await run();
    const a = await userByTag('avmcz');
    const b = await userByTag('headofvm');
    await db.doc(`users/${a.uid}`).update({ language: FieldValue.delete(), fcmTokens: ['tok-a'] });
    await db.doc(`users/${b.uid}`).update({ language: 'ro', fcmTokens: FieldValue.delete() });
    await run();
    expect(await userDoc(a.uid)).toMatchObject({ language: 'en', fcmTokens: ['tok-a'] });
    expect(await userDoc(b.uid)).toMatchObject({ language: 'ro', fcmTokens: [] });
  });

  test('a re-run overwrites stores/850 so zone fixes propagate', async () => {
    await run();
    await db.doc('stores/850').update({ name: 'Wrong', departments: [] });
    await run();
    expect((await db.doc('stores/850').get()).data()).toEqual(STORE_850);
  });

  test('re-applies the claims when they were changed', async () => {
    await run();
    const { uid } = await userByTag('avmcz');
    await auth.setCustomUserClaims(uid, { role: 'director', country: null, storeId: null });
    await run();
    expect((await auth.getUser(uid)).customClaims).toEqual({ role: 'avm', country: 'CZ', storeId: null });
  });

  test('logs one line per account and never an email address', async () => {
    const lines: string[] = [];
    await run((line) => lines.push(line));
    expect(lines).toContain('ok store850 (store)');
    expect(lines).toContain('ok headofvm (head_vm)');
    expect(lines).toContain('ok director (director)');
    expect(lines).toContain('ok avmcz (avm)');
    expect(lines).toContain('ok amcz (am)');
    expect(lines.join('\n')).not.toMatch(/@|example\.com/);
  });
});
