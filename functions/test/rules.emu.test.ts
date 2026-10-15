import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, listAll, ref, uploadBytes, type StorageReference } from 'firebase/storage';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

const rules = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

const PHOTO_PATH = 'reports/CZ/850/r1/women-image/a.jpg';
const jpeg = { contentType: 'image/jpeg' };
const bytes = (n: number) => new Uint8Array(n).fill(1);

let env: RulesTestEnvironment;

// RulesTestEnvironment.clearStorage() only deletes objects in the bucket root, so remove nested objects ourselves.
async function deleteAll(folder: StorageReference): Promise<void> {
  const { items, prefixes } = await listAll(folder);
  await Promise.all([...items.map((item) => deleteObject(item)), ...prefixes.map(deleteAll)]);
}

const store850 = () => env.authenticatedContext('u-store850', { role: 'store', country: 'CZ', storeId: '850' });
const store851 = () => env.authenticatedContext('u-store851', { role: 'store', country: 'CZ', storeId: '851' });
const avmCz = () => env.authenticatedContext('u-avm-cz', { role: 'avm', country: 'CZ', storeId: null });
const amCz = () => env.authenticatedContext('u-am-cz', { role: 'am', country: 'CZ', storeId: null });
const avmSk = () => env.authenticatedContext('u-avm-sk', { role: 'avm', country: 'SK', storeId: null });
const headVm = () => env.authenticatedContext('u-headvm', { role: 'head_vm', country: null, storeId: null });
const director = () => env.authenticatedContext('u-director', { role: 'director', country: null, storeId: null });
const anon = () => env.unauthenticatedContext();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-vm-report',
    firestore: { rules: rules('firestore.rules') },
    storage: { rules: rules('storage.rules') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled((ctx) => deleteAll(ref(ctx.storage())));
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'stores/850'), { id: '850', country: 'CZ', name: 'Palladium Praha' });
    await setDoc(doc(db, 'stores/900'), { id: '900', country: 'SK', name: 'Other SK' });
    await setDoc(doc(db, 'reports/draft850'), { id: 'draft850', storeId: '850', country: 'CZ', status: 'draft', createdAt: 1, sentAt: null });
    await setDoc(doc(db, 'reports/sent850'), { id: 'sent850', storeId: '850', country: 'CZ', status: 'sent', createdAt: 2, sentAt: 3 });
    await setDoc(doc(db, 'reports/sent900'), { id: 'sent900', storeId: '900', country: 'SK', status: 'sent', createdAt: 2, sentAt: 3 });
    await setDoc(doc(db, 'reports/draft850/zones/women-image'), { id: 'women-image', state: 'photo_added' });
    await setDoc(doc(db, 'reports/sent850/zones/women-image'), { id: 'women-image', state: 'submitted' });
    await setDoc(doc(db, 'reports/sent850/zones/women-image/feedback/f1'), { id: 'f1', comment: 'Re-fold' });
    await setDoc(doc(db, 'reports/draft850/zones/women-image/feedback/f1'), { id: 'f1', comment: 'Re-fold' });
    await setDoc(doc(db, 'users/u-store850'), { role: 'store', country: 'CZ', storeId: '850', language: 'en', fcmTokens: [] });
    await setDoc(doc(db, 'users/u-avm-cz'), { role: 'avm', country: 'CZ', storeId: null, language: 'en', fcmTokens: [] });
  });
});

describe('firestore reports', () => {
  test('store reads own draft report', async () => {
    await assertSucceeds(getDoc(doc(store850().firestore(), 'reports/draft850')));
  });
  test('store reads own sent report', async () => {
    await assertSucceeds(getDoc(doc(store850().firestore(), 'reports/sent850')));
  });
  test("another store cannot read the first store's draft", async () => {
    await assertFails(getDoc(doc(store851().firestore(), 'reports/draft850')));
  });
  test("another store cannot read the first store's sent report", async () => {
    await assertFails(getDoc(doc(store851().firestore(), 'reports/sent850')));
  });
  test('avm of the same country reads a sent report', async () => {
    await assertSucceeds(getDoc(doc(avmCz().firestore(), 'reports/sent850')));
  });
  test('am of the same country reads a sent report', async () => {
    await assertSucceeds(getDoc(doc(amCz().firestore(), 'reports/sent850')));
  });
  test('avm of the same country cannot read a draft', async () => {
    await assertFails(getDoc(doc(avmCz().firestore(), 'reports/draft850')));
  });
  test('avm of another country cannot read a sent report', async () => {
    await assertFails(getDoc(doc(avmSk().firestore(), 'reports/sent850')));
  });
  test('director reads a sent report in any country', async () => {
    await assertSucceeds(getDoc(doc(director().firestore(), 'reports/sent850')));
    await assertSucceeds(getDoc(doc(director().firestore(), 'reports/sent900')));
  });
  test('head of VM reads a sent report but not a draft', async () => {
    await assertSucceeds(getDoc(doc(headVm().firestore(), 'reports/sent850')));
    await assertFails(getDoc(doc(headVm().firestore(), 'reports/draft850')));
  });
  test('unauthenticated users read nothing', async () => {
    await assertFails(getDoc(doc(anon().firestore(), 'reports/sent850')));
    await assertFails(getDoc(doc(anon().firestore(), 'stores/850')));
  });
  test('a token without a recognised role reads nothing', async () => {
    const odd = env.authenticatedContext('u-odd', { role: 'intern', country: 'CZ', storeId: null });
    await assertFails(getDoc(doc(odd.firestore(), 'reports/sent850')));
    await assertFails(getDoc(doc(odd.firestore(), 'stores/850')));
  });
  test('a store token cannot be used as a country-wide reader', async () => {
    const sneaky = env.authenticatedContext('u-sneaky', { role: 'store', country: 'CZ', storeId: null });
    await assertFails(getDoc(doc(sneaky.firestore(), 'reports/sent850')));
  });
  test('reviewer list query filtered by country and status is allowed, unfiltered is not', async () => {
    const db = avmCz().firestore();
    await assertSucceeds(getDocs(query(collection(db, 'reports'), where('status', '==', 'sent'), where('country', '==', 'CZ'))));
    await assertFails(getDocs(collection(db, 'reports')));
    await assertFails(getDocs(query(collection(db, 'reports'), where('status', '==', 'sent'))));
  });
  test('store list query filtered by own storeId is allowed', async () => {
    await assertSucceeds(getDocs(query(collection(store850().firestore(), 'reports'), where('storeId', '==', '850'))));
    await assertFails(getDocs(query(collection(store850().firestore(), 'reports'), where('storeId', '==', '851'))));
  });
});

describe('firestore clients never write reports', () => {
  test('store cannot create a report', async () => {
    await assertFails(setDoc(doc(store850().firestore(), 'reports/x'), { storeId: '850', country: 'CZ', status: 'draft' }));
  });
  test('store cannot update its own draft', async () => {
    await assertFails(updateDoc(doc(store850().firestore(), 'reports/draft850'), { campaignName: 'hacked' }));
  });
  test('reviewer cannot update a sent report', async () => {
    await assertFails(updateDoc(doc(director().firestore(), 'reports/sent850'), { status: 'draft' }));
  });
  test('nobody writes zones or feedback', async () => {
    await assertFails(setDoc(doc(store850().firestore(), 'reports/draft850/zones/women-image'), { state: 'approved' }));
    await assertFails(setDoc(doc(director().firestore(), 'reports/sent850/zones/women-image/feedback/f2'), { comment: 'x' }));
  });
});

describe('firestore zones and feedback', () => {
  test('store reads zones and feedback of its own report', async () => {
    const db = store850().firestore();
    await assertSucceeds(getDoc(doc(db, 'reports/draft850/zones/women-image')));
    await assertSucceeds(getDoc(doc(db, 'reports/sent850/zones/women-image/feedback/f1')));
  });
  test("another store cannot read zones or feedback of someone else's report", async () => {
    const db = store851().firestore();
    await assertFails(getDoc(doc(db, 'reports/sent850/zones/women-image')));
    await assertFails(getDoc(doc(db, 'reports/sent850/zones/women-image/feedback/f1')));
  });
  test('reviewer of the country reads zones and feedback of a sent report', async () => {
    const db = avmCz().firestore();
    await assertSucceeds(getDoc(doc(db, 'reports/sent850/zones/women-image')));
    await assertSucceeds(getDoc(doc(db, 'reports/sent850/zones/women-image/feedback/f1')));
  });
  test('reviewer cannot read zones or feedback of a draft report', async () => {
    const db = avmCz().firestore();
    await assertFails(getDoc(doc(db, 'reports/draft850/zones/women-image')));
    await assertFails(getDoc(doc(db, 'reports/draft850/zones/women-image/feedback/f1')));
  });
  test('reviewer of another country cannot read zones or feedback', async () => {
    const db = avmSk().firestore();
    await assertFails(getDoc(doc(db, 'reports/sent850/zones/women-image')));
    await assertFails(getDoc(doc(db, 'reports/sent850/zones/women-image/feedback/f1')));
  });
});

describe('firestore stores', () => {
  test('store reads itself but not another store', async () => {
    await assertSucceeds(getDoc(doc(store850().firestore(), 'stores/850')));
    await assertFails(getDoc(doc(store850().firestore(), 'stores/900')));
  });
  test('reviewer reads stores of own country only', async () => {
    await assertSucceeds(getDoc(doc(avmCz().firestore(), 'stores/850')));
    await assertFails(getDoc(doc(avmCz().firestore(), 'stores/900')));
  });
  test('director reads every store', async () => {
    await assertSucceeds(getDoc(doc(director().firestore(), 'stores/850')));
    await assertSucceeds(getDoc(doc(director().firestore(), 'stores/900')));
  });
  test('nobody writes stores', async () => {
    await assertFails(setDoc(doc(director().firestore(), 'stores/850'), { name: 'x' }));
  });
});

describe('firestore users', () => {
  test('a user reads only own user doc', async () => {
    await assertSucceeds(getDoc(doc(store850().firestore(), 'users/u-store850')));
    await assertFails(getDoc(doc(store850().firestore(), 'users/u-avm-cz')));
  });
  test('store updates own language', async () => {
    await assertSucceeds(updateDoc(doc(store850().firestore(), 'users/u-store850'), { language: 'cs' }));
  });
  test('store updates own fcmTokens', async () => {
    await assertSucceeds(updateDoc(doc(store850().firestore(), 'users/u-store850'), { fcmTokens: ['t1', 't2'] }));
  });
  test('store cannot promote itself', async () => {
    await assertFails(updateDoc(doc(store850().firestore(), 'users/u-store850'), { role: 'director' }));
  });
  test('store cannot change its storeId or country, even together with a valid field', async () => {
    await assertFails(updateDoc(doc(store850().firestore(), 'users/u-store850'), { storeId: '851' }));
    await assertFails(updateDoc(doc(store850().firestore(), 'users/u-store850'), { country: 'SK', language: 'cs' }));
  });
  test('unsupported language is rejected', async () => {
    await assertFails(updateDoc(doc(store850().firestore(), 'users/u-store850'), { language: 'de' }));
  });
  test('fcmTokens must be a list of at most 10', async () => {
    const tokens = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
    await assertSucceeds(updateDoc(doc(store850().firestore(), 'users/u-store850'), { fcmTokens: tokens(10) }));
    await assertFails(updateDoc(doc(store850().firestore(), 'users/u-store850'), { fcmTokens: tokens(11) }));
    await assertFails(updateDoc(doc(store850().firestore(), 'users/u-store850'), { fcmTokens: 'not-a-list' }));
  });
  test("a user cannot update someone else's user doc", async () => {
    await assertFails(updateDoc(doc(store851().firestore(), 'users/u-store850'), { language: 'cs' }));
  });
  test('users cannot create or delete user docs', async () => {
    await assertFails(setDoc(doc(store851().firestore(), 'users/u-store851'), { role: 'director', language: 'en', fcmTokens: [] }));
    await assertFails(deleteDoc(doc(store850().firestore(), 'users/u-store850')));
  });
});

describe('storage', () => {
  const photoRef = (ctx: ReturnType<typeof store850>, path = PHOTO_PATH) => ref(ctx.storage(), path);

  async function seedPhoto() {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), PHOTO_PATH), bytes(1024), jpeg);
    });
  }

  test('store creates a 1 KB jpeg in its own path', async () => {
    await assertSucceeds(uploadBytes(photoRef(store850()), bytes(1024), jpeg));
  });
  test('png is rejected', async () => {
    await assertFails(uploadBytes(photoRef(store850()), bytes(1024), { contentType: 'image/png' }));
  });
  test('upload without a content type is rejected', async () => {
    await assertFails(uploadBytes(photoRef(store850()), bytes(1024)));
  });
  test('upload of 5 MB or more is rejected, just under is accepted', async () => {
    await assertFails(uploadBytes(photoRef(store850()), bytes(5 * 1024 * 1024), jpeg));
    await assertSucceeds(uploadBytes(photoRef(store850()), bytes(5 * 1024 * 1024 - 1), jpeg));
  });
  test('store cannot upload under another store id', async () => {
    await assertFails(uploadBytes(photoRef(store850(), 'reports/CZ/851/r1/women-image/a.jpg'), bytes(1024), jpeg));
  });
  test('store cannot upload under another country', async () => {
    await assertFails(uploadBytes(photoRef(store850(), 'reports/SK/850/r1/women-image/a.jpg'), bytes(1024), jpeg));
  });
  test('a reviewer cannot upload', async () => {
    await assertFails(uploadBytes(photoRef(director(), PHOTO_PATH), bytes(1024), jpeg));
    await assertFails(uploadBytes(photoRef(avmCz(), PHOTO_PATH), bytes(1024), jpeg));
  });
  test('unauthenticated users cannot upload', async () => {
    await assertFails(uploadBytes(photoRef(anon()), bytes(1024), jpeg));
  });
  test('uploads outside the reports path are rejected', async () => {
    await assertFails(uploadBytes(photoRef(store850(), 'other/CZ/850/r1/women-image/a.jpg'), bytes(1024), jpeg));
  });
  test('existing object cannot be overwritten', async () => {
    await seedPhoto();
    await assertFails(uploadBytes(photoRef(store850()), bytes(2048), jpeg));
  });
  test('existing object cannot be deleted by its store or a reviewer', async () => {
    await seedPhoto();
    await assertFails(deleteObject(photoRef(store850())));
    await assertFails(deleteObject(photoRef(director())));
  });
  test('owning store reads its photo', async () => {
    await seedPhoto();
    await assertSucceeds(getBytes(photoRef(store850())));
  });
  test('another store cannot read the photo', async () => {
    await seedPhoto();
    await assertFails(getBytes(photoRef(store851())));
  });
  test('reviewer of the country reads the photo', async () => {
    await seedPhoto();
    await assertSucceeds(getBytes(photoRef(avmCz())));
    await assertSucceeds(getBytes(photoRef(amCz())));
  });
  test('reviewer of another country cannot read the photo', async () => {
    await seedPhoto();
    await assertFails(getBytes(photoRef(avmSk())));
  });
  test('head of VM and director read any photo', async () => {
    await seedPhoto();
    await assertSucceeds(getBytes(photoRef(headVm())));
    await assertSucceeds(getBytes(photoRef(director())));
  });
  test('unauthenticated users cannot read the photo', async () => {
    await seedPhoto();
    await assertFails(getBytes(photoRef(anon())));
  });
});
