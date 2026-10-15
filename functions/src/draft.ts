import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/https';
import { canViewCountry, isReviewer } from '@shared/access';
import { canSend, draftState } from '@shared/status';
import { allZones } from '@shared/store850';
import type { PhotoRef, ReportDoc, StoreDef, ZoneDoc } from '@shared/types';
import type { Caller } from './caller';
import {
  MAX_STORE_COMMENT, applyTransition, assertPhotosUploaded, docId, invalid, notifyAfterCommit, parsePhotos, requireStore, toRef,
  zonePhotoFolder,
} from './common';
import type { Deps } from './deps';
import { recomputeSummary, summarize } from './summary';

const MAX_CAMPAIGN_NAME = 80;

export async function createDraft(c: Caller, data: { campaignName: string }, d: Deps): Promise<{ reportId: string }> {
  const storeId = requireStore(c);
  const campaignName = typeof data?.campaignName === 'string' ? data.campaignName.trim() : '';
  if (campaignName.length < 1 || campaignName.length > MAX_CAMPAIGN_NAME) {
    throw invalid(`campaign name must be 1 to ${MAX_CAMPAIGN_NAME} characters`);
  }

  const reportDoc = d.db.collection('reports').doc();
  const createdAt = d.now();
  await d.db.runTransaction(async (tx) => {
    const [storeSnap, existing] = await Promise.all([
      tx.get(d.db.doc(`stores/${storeId}`)),
      tx.get(d.db.collection('reports').where('storeId', '==', storeId).where('status', '==', 'draft').limit(1)),
    ]);
    if (!storeSnap.exists) throw new HttpsError('not-found', 'Store not found');
    if (!existing.empty) throw new HttpsError('failed-precondition', 'This store already has a draft report');

    const store = storeSnap.data() as StoreDef;
    const zones: ZoneDoc[] = allZones(store).map((z) => ({
      id: z.id, reportId: reportDoc.id, storeId: store.id, country: store.country, departmentId: z.departmentId, name: z.name, order: z.order,
      state: 'empty', versions: [{ n: 1, photos: [], storeComment: '', createdAt }], earliestOpenDeadline: null,
      reminderDayBeforeSentFor: null, reminderOverdueSentFor: null, approvedBy: null, approvedAt: null,
    }));
    const report: ReportDoc = {
      id: reportDoc.id, storeId: store.id, storeCode: store.code, storeName: store.name, country: store.country, timezone: store.timezone,
      campaignName, status: 'draft', createdAt, sentAt: null, seenBy: [], zoneSummary: summarize(zones),
    };
    tx.create(reportDoc, report);
    for (const z of zones) tx.create(reportDoc.collection('zones').doc(z.id), z);
  });
  return { reportId: reportDoc.id };
}

export async function updateDraftZone(
  c: Caller,
  data: { reportId: string; zoneId: string; photos: PhotoRef[]; storeComment: string; notInCampaign: boolean },
  d: Deps,
): Promise<void> {
  const storeId = requireStore(c);
  const reportId = docId(data?.reportId, 'reportId');
  const zoneId = docId(data?.zoneId, 'zoneId');
  const photos = parsePhotos(data.photos);
  const { storeComment, notInCampaign } = data;
  if (typeof storeComment !== 'string' || storeComment.length > MAX_STORE_COMMENT) throw invalid(`comment must be at most ${MAX_STORE_COMMENT} characters`);
  if (typeof notInCampaign !== 'boolean') throw invalid('notInCampaign must be true or false');
  if (notInCampaign && photos.length > 0) throw invalid('a zone that is not part of the campaign cannot have photos');
  const state = draftState(photos.length, notInCampaign);

  const reportRef = d.db.doc(`reports/${reportId}`);
  const zoneRef = reportRef.collection('zones').doc(zoneId);
  await d.db.runTransaction(async (tx) => {
    const [reportSnap, zoneSnap] = await Promise.all([tx.get(reportRef), tx.get(zoneRef)]);
    const report = reportSnap.data() as ReportDoc | undefined;
    if (!report) throw new HttpsError('not-found', 'Report not found');
    if (report.storeId !== storeId) throw new HttpsError('permission-denied', 'This is not your report');
    if (report.status !== 'draft') throw new HttpsError('failed-precondition', 'The report was already sent');
    const zone = zoneSnap.data() as ZoneDoc | undefined;
    if (!zone) throw new HttpsError('not-found', 'Zone not found');

    await assertPhotosUploaded(d, photos, zonePhotoFolder(report, zoneId));

    // recomputeSummary reads every zone, so it runs before the first write and gets this zone's new state in memory.
    const zoneSummary = await recomputeSummary(tx, d.db, reportId, { [zoneId]: { state, earliestOpenDeadline: zone.earliestOpenDeadline } });
    tx.update(zoneRef, { state, versions: [{ ...zone.versions[0], photos, storeComment }] });
    tx.update(reportRef, { zoneSummary });
  });
}

export async function sendReport(c: Caller, data: { reportId: string }, d: Deps): Promise<void> {
  const storeId = requireStore(c);
  const reportId = docId(data?.reportId, 'reportId');
  const reportRef = d.db.doc(`reports/${reportId}`);

  const sent = await d.db.runTransaction(async (tx) => {
    const reportSnap = await tx.get(reportRef);
    const report = reportSnap.data() as ReportDoc | undefined;
    if (!report) throw new HttpsError('not-found', 'Report not found');
    if (report.storeId !== storeId) throw new HttpsError('permission-denied', 'This is not your report');
    if (report.status !== 'draft') throw new HttpsError('failed-precondition', 'The report was already sent');

    const zones = (await tx.get(reportRef.collection('zones'))).docs.map((s) => s.data() as ZoneDoc);
    if (!canSend(zones.map((z) => z.state))) {
      throw new HttpsError('failed-precondition', 'Every zone needs a photo or must be marked not part of the campaign');
    }

    // All zones were read above, so the summary is built from them in memory instead of re-reading via recomputeSummary.
    const submitted = zones.map((z) => ({ ...z, state: applyTransition(z.state, 'send') }));
    for (const z of submitted) tx.update(reportRef.collection('zones').doc(z.id), { state: z.state });
    tx.update(reportRef, { status: 'sent', sentAt: d.now(), zoneSummary: summarize(submitted) });
    return toRef(report);
  });
  await notifyAfterCommit(d, { kind: 'report_sent', report: sent });
}

export async function markSeen(c: Caller, data: { reportId: string }, d: Deps): Promise<void> {
  if (!isReviewer(c.claims.role)) throw new HttpsError('permission-denied', 'Only reviewers can mark a report as seen');
  const reportId = docId(data?.reportId, 'reportId');
  const reportRef = d.db.doc(`reports/${reportId}`);

  await d.db.runTransaction(async (tx) => {
    const report = (await tx.get(reportRef)).data() as ReportDoc | undefined;
    if (!report) throw new HttpsError('not-found', 'Report not found');
    if (!canViewCountry(c.claims, report.country)) throw new HttpsError('permission-denied', 'This report is outside your countries');
    if (report.status !== 'sent') throw new HttpsError('failed-precondition', 'The report was not sent yet');
    if (!report.seenBy.includes(c.uid)) tx.update(reportRef, { seenBy: FieldValue.arrayUnion(c.uid) });
  });
}
