import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { STORE_850, allZones } from '@shared/store850';
import type { PhotoRef } from '@shared/types';
import type { Caller } from '../src/caller';
import type { Bucket, Deps } from '../src/deps';
import { createDraft, sendReport, updateDraftZone } from '../src/draft';
import type { Notifier, PushEvent } from '../src/notifier';

// The emulators need no credentials; skip the GCE metadata probe google-auth-library would otherwise run (and warn about).
process.env.METADATA_SERVER_DETECTION ??= 'none';

export const PROJECT_ID = 'demo-vm-report';
/** Fixed clock for tests: 2026-10-15 08:00:00 UTC. */
export const NOW = Date.UTC(2026, 9, 15, 8, 0, 0);

export class RecordingNotifier implements Notifier {
  readonly events: PushEvent[] = [];

  async notify(e: PushEvent): Promise<void> {
    this.events.push(e);
  }
}

export type TestDeps = Deps & { notifier: RecordingNotifier };

/** Admin SDK against the Firestore and Storage emulators (host variables are set by `firebase emulators:exec`). */
export function testDeps(): TestDeps {
  const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID, storageBucket: `${PROJECT_ID}.appspot.com` });
  return { db: getFirestore(app), bucket: getStorage(app).bucket(), notifier: new RecordingNotifier(), now: () => NOW };
}

export async function resetData(d: Deps): Promise<void> {
  await Promise.all(['reports', 'stores', 'users'].map((name) => d.db.recursiveDelete(d.db.collection(name))));
  await d.bucket.deleteFiles({ force: true });
}

export async function seedStore850(db: Firestore): Promise<void> {
  await db.doc(`stores/${STORE_850.id}`).set(STORE_850);
}

export const ZONE_IDS = allZones(STORE_850).map((z) => z.id);

const caller = (uid: string, claims: Caller['claims'], name: string): Caller => ({ uid, claims, name });

export const storeCaller = caller('u-store850', { role: 'store', country: 'CZ', storeId: '850' }, 'Store');
export const otherStoreCaller = caller('u-store851', { role: 'store', country: 'CZ', storeId: '851' }, 'Store');
export const avmCz = caller('u-avm-cz', { role: 'avm', country: 'CZ', storeId: null }, 'Area VM');
export const avmSk = caller('u-avm-sk', { role: 'avm', country: 'SK', storeId: null }, 'Area VM');
export const headVm = caller('u-headvm', { role: 'head_vm', country: null, storeId: null }, 'Head of VM');
export const director = caller('u-director', { role: 'director', country: null, storeId: null }, 'Director of Operations');

/** Smallest valid JPEG envelope: start and end of image markers. */
const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

export async function putPhoto(bucket: Bucket, path: string): Promise<PhotoRef> {
  await bucket.file(path).save(TINY_JPEG, { contentType: 'image/jpeg' });
  return { path, width: 1, height: 1 };
}

export const photoPath = (reportId: string, zoneId: string, file = 'a.jpg') => `reports/CZ/850/${reportId}/${zoneId}/${file}`;

/** A sent report built with the real draft handlers: one uploaded photo per zone, except the listed not_in_campaign zones. */
export async function createSentReport(d: Deps, notInCampaign: string[] = []): Promise<string> {
  const { reportId } = await createDraft(storeCaller, { campaignName: 'Autumn 2026' }, d);
  const photos = await Promise.all(ZONE_IDS.map((zoneId) => (
    notInCampaign.includes(zoneId) ? [] : putPhoto(d.bucket, photoPath(reportId, zoneId)).then((p) => [p])
  )));
  // One at a time, like the app does: every save rewrites the report summary, so parallel saves would only contend.
  for (const [i, zoneId] of ZONE_IDS.entries()) {
    await updateDraftZone(storeCaller, {
      reportId, zoneId, photos: photos[i], storeComment: '', notInCampaign: notInCampaign.includes(zoneId),
    }, d);
  }
  await sendReport(storeCaller, { reportId }, d);
  return reportId;
}
