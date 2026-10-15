import { HttpsError } from 'firebase-functions/https';
import { MAX_PHOTOS, TransitionError, nextState, type ZoneAction } from '@shared/status';
import type { PhotoRef, ReportDoc, ZoneState } from '@shared/types';
import type { Caller } from './caller';
import type { Deps } from './deps';
import type { PushEvent, ReportRef } from './notifier';

/** Longest store comment on a zone version, in the draft and in a correction. */
export const MAX_STORE_COMMENT = 500;
const DOC_ID = /^[A-Za-z0-9_-]{1,100}$/;

export const invalid = (message: string) => new HttpsError('invalid-argument', message);

export function requireStore(c: Caller): string {
  if (c.claims.role !== 'store' || !c.claims.storeId) throw new HttpsError('permission-denied', 'Only a store can do this');
  return c.claims.storeId;
}

export function docId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DOC_ID.test(value)) throw invalid(`${field} is not a valid id`);
  return value;
}

const isDimension = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

export function parsePhotos(value: unknown, min = 0): PhotoRef[] {
  if (!Array.isArray(value)) throw invalid('photos must be a list');
  if (value.length < min) throw invalid(`at least ${min} photo${min === 1 ? '' : 's'} needed`);
  if (value.length > MAX_PHOTOS) throw invalid(`at most ${MAX_PHOTOS} photos per zone`);
  const photos = value.map((p: unknown) => {
    const { path, width, height } = (p ?? {}) as Record<string, unknown>;
    if (typeof path !== 'string' || !path || !isDimension(width) || !isDimension(height)) throw invalid('each photo needs a path, width and height');
    return { path, width, height };
  });
  if (new Set(photos.map((p) => p.path)).size !== photos.length) throw invalid('the same photo cannot be used twice');
  return photos;
}

/** Storage folder of one zone's photos; the country and store come from the report, never from the caller. */
export const zonePhotoFolder = (report: ReportDoc, zoneId: string) => `reports/${report.country}/${report.storeId}/${report.id}/${zoneId}/`;

/** Photos are uploaded before the zone is saved; never reference a file that is not in Storage. */
export async function assertPhotosUploaded(d: Deps, photos: PhotoRef[], folder: string): Promise<void> {
  await Promise.all(photos.map(async ({ path }) => {
    const file = path.slice(folder.length);
    if (!path.startsWith(folder) || !file || file.includes('/')) throw invalid('photo is not in this zone folder');
    const [exists] = await d.bucket.file(path).exists();
    if (!exists) throw invalid('photo was not uploaded');
  }));
}

export const toRef = (r: ReportDoc): ReportRef => ({
  id: r.id, storeId: r.storeId, storeCode: r.storeCode, storeName: r.storeName, country: r.country, campaignName: r.campaignName,
});

/** The change is already committed, so a failing push must not turn the call into an error. */
export async function notifyAfterCommit(d: Deps, event: PushEvent): Promise<void> {
  try {
    await d.notifier.notify(event);
  } catch (e) {
    console.error(`notification '${event.kind}' failed`, e);
  }
}

/** The zone state machine, with a refused transition reported to the client as failed-precondition. */
export function applyTransition(state: ZoneState, action: ZoneAction): ZoneState {
  try {
    return nextState(state, action);
  } catch (e) {
    if (e instanceof TransitionError) throw new HttpsError('failed-precondition', e.message);
    throw e;
  }
}
