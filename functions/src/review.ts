import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/https';
import { isReviewer, isReviewerFor } from '@shared/access';
import { dayBeforeAlreadyCovered, isValidDeadline } from '@shared/dates';
import type { FeedbackDoc, PhotoRef, ReportDoc, Stroke, ZoneDoc } from '@shared/types';
import type { Caller } from './caller';
import {
  MAX_STORE_COMMENT, applyTransition, assertPhotosUploaded, docId, invalid, notifyAfterCommit, parsePhotos, requireStore, toRef,
  zonePhotoFolder,
} from './common';
import type { Deps } from './deps';
import { recomputeSummary, summarize } from './summary';

const MAX_FEEDBACK_COMMENT = 1000;
const MAX_STROKES = 50;
const MAX_STROKE_VALUES = 2000;

function requireReviewer(c: Caller): void {
  if (!isReviewer(c.claims.role)) throw new HttpsError('permission-denied', 'Only reviewers can do this');
}

function requireReviewerFor(c: Caller, report: ReportDoc): void {
  if (!isReviewerFor(c.claims, report.country)) throw new HttpsError('permission-denied', 'This report is outside your countries');
}

function existing<T>(snap: DocumentSnapshot, what: string): T {
  const data = snap.data();
  if (!data) throw new HttpsError('not-found', `${what} not found`);
  return data as T;
}

function requireSent(report: ReportDoc): void {
  if (report.status !== 'sent') throw new HttpsError('failed-precondition', 'The report was not sent yet');
}

const isUnit = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 1;

function parseStrokes(value: unknown): Stroke[] {
  if (!Array.isArray(value) || value.length > MAX_STROKES) throw invalid(`strokes must be a list of at most ${MAX_STROKES}`);
  return value.map((s: unknown) => {
    const points = (s as { points?: unknown } | null)?.points;
    if (!Array.isArray(points) || points.length % 2 !== 0 || points.length > MAX_STROKE_VALUES || !points.every(isUnit)) {
      throw invalid(`each stroke needs an even number of values, at most ${MAX_STROKE_VALUES}, each between 0 and 1`);
    }
    return { points };
  });
}

const earliest = (deadlines: string[]) => deadlines.reduce((a, b) => (b < a ? b : a));

export async function giveFeedback(
  c: Caller,
  data: { reportId: string; zoneId: string; version: number; photoIndex: number; comment: string; strokes: Stroke[]; deadline: string },
  d: Deps,
): Promise<{ feedbackId: string }> {
  requireReviewer(c);
  const reportId = docId(data?.reportId, 'reportId');
  const zoneId = docId(data?.zoneId, 'zoneId');
  const { version, photoIndex, deadline } = data;
  if (!Number.isInteger(version) || version < 1) throw invalid('version must be a positive whole number');
  if (!Number.isInteger(photoIndex) || photoIndex < 0) throw invalid('photoIndex must be a whole number from 0');
  const comment = typeof data.comment === 'string' ? data.comment.trim() : '';
  if (comment.length < 1 || comment.length > MAX_FEEDBACK_COMMENT) throw invalid(`comment must be 1 to ${MAX_FEEDBACK_COMMENT} characters`);
  const strokes = parseStrokes(data.strokes);
  if (typeof deadline !== 'string') throw invalid('deadline must be a date');

  const now = d.now();
  const reportRef = d.db.doc(`reports/${reportId}`);
  const zoneRef = reportRef.collection('zones').doc(zoneId);
  const feedbackRef = zoneRef.collection('feedback').doc();

  const notice = await d.db.runTransaction(async (tx) => {
    const [reportSnap, zoneSnap, openSnap] = await Promise.all([
      tx.get(reportRef), tx.get(zoneRef), tx.get(zoneRef.collection('feedback').where('status', '==', 'open')),
    ]);
    const report = existing<ReportDoc>(reportSnap, 'Report');
    requireReviewerFor(c, report);
    requireSent(report);
    const zone = existing<ZoneDoc>(zoneSnap, 'Zone');
    if (!isValidDeadline(deadline, now, report.timezone)) throw invalid('deadline must be a date, not before today in the store');

    const state = applyTransition(zone.state, 'feedback');
    // Feedback belongs under the photos the store currently shows: older versions are superseded and never get corrected.
    const latest = zone.versions[zone.versions.length - 1];
    if (version > latest.n) throw invalid('this version does not exist');
    if (version < latest.n) throw new HttpsError('failed-precondition', 'The store already sent newer photos for this zone');
    if (photoIndex >= latest.photos.length) throw invalid('this photo does not exist');

    const openDeadlines = openSnap.docs.map((s) => (s.data() as FeedbackDoc).deadline);
    const earliestOpenDeadline = earliest([deadline, ...openDeadlines]);
    const zoneSummary = await recomputeSummary(tx, d.db, reportId, { [zoneId]: { state, earliestOpenDeadline } });

    const feedback: FeedbackDoc = {
      id: feedbackRef.id, authorUid: c.uid, authorRole: c.claims.role, authorName: c.name, version, photoIndex, comment, strokes,
      deadline, createdAt: now, status: 'open',
    };
    // A deadline that is already inside its day-before window needs no extra reminder: the feedback itself is that notice.
    // Flags are keyed by deadline, so a new earliest deadline re-arms the reminders without any reset here.
    const dayBeforeCovered = deadline === earliestOpenDeadline && dayBeforeAlreadyCovered(deadline, now, report.timezone);
    tx.create(feedbackRef, feedback);
    tx.update(zoneRef, {
      state, earliestOpenDeadline, approvedBy: null, approvedAt: null,
      ...(dayBeforeCovered ? { reminderDayBeforeSentFor: deadline } : {}),
    });
    tx.update(reportRef, { zoneSummary });
    return { report: toRef(report), zoneName: zone.name };
  });
  await notifyAfterCommit(d, { kind: 'feedback', ...notice, zoneId, deadline });
  return { feedbackId: feedbackRef.id };
}

export async function sendCorrection(
  c: Caller,
  data: { reportId: string; zoneId: string; photos: PhotoRef[]; storeComment: string },
  d: Deps,
): Promise<void> {
  const storeId = requireStore(c);
  const reportId = docId(data?.reportId, 'reportId');
  const zoneId = docId(data?.zoneId, 'zoneId');
  const photos = parsePhotos(data.photos, 1);
  const storeComment = typeof data.storeComment === 'string' ? data.storeComment.trim() : null;
  if (storeComment === null || storeComment.length > MAX_STORE_COMMENT) throw invalid(`comment must be at most ${MAX_STORE_COMMENT} characters`);

  const now = d.now();
  const reportRef = d.db.doc(`reports/${reportId}`);
  const zoneRef = reportRef.collection('zones').doc(zoneId);

  const notice = await d.db.runTransaction(async (tx) => {
    const [reportSnap, zoneSnap, openSnap] = await Promise.all([
      tx.get(reportRef), tx.get(zoneRef), tx.get(zoneRef.collection('feedback').where('status', '==', 'open')),
    ]);
    const report = existing<ReportDoc>(reportSnap, 'Report');
    if (report.storeId !== storeId) throw new HttpsError('permission-denied', 'This is not your report');
    requireSent(report);
    const zone = existing<ZoneDoc>(zoneSnap, 'Zone');
    const state = applyTransition(zone.state, 'correction');
    await assertPhotosUploaded(d, photos, zonePhotoFolder(report, zoneId));

    const zoneSummary = await recomputeSummary(tx, d.db, reportId, { [zoneId]: { state, earliestOpenDeadline: null } });
    const previous = zone.versions[zone.versions.length - 1];
    tx.update(zoneRef, {
      state, earliestOpenDeadline: null, versions: [...zone.versions, { n: previous.n + 1, photos, storeComment, createdAt: now }],
    });
    // One correction covers every open feedback of the zone.
    for (const open of openSnap.docs) tx.update(open.ref, { status: 'answered' });
    tx.update(reportRef, { zoneSummary });
    return { report: toRef(report), zoneName: zone.name };
  });
  await notifyAfterCommit(d, { kind: 'correction_sent', ...notice, zoneId });
}

export async function approveZone(c: Caller, data: { reportId: string; zoneId: string }, d: Deps): Promise<void> {
  requireReviewer(c);
  const reportId = docId(data?.reportId, 'reportId');
  const zoneId = docId(data?.zoneId, 'zoneId');
  const now = d.now();
  const reportRef = d.db.doc(`reports/${reportId}`);
  const zoneRef = reportRef.collection('zones').doc(zoneId);

  const notice = await d.db.runTransaction(async (tx) => {
    const [reportSnap, zoneSnap] = await Promise.all([tx.get(reportRef), tx.get(zoneRef)]);
    const report = existing<ReportDoc>(reportSnap, 'Report');
    requireReviewerFor(c, report);
    requireSent(report);
    const zone = existing<ZoneDoc>(zoneSnap, 'Zone');
    const state = applyTransition(zone.state, 'approve');

    const zoneSummary = await recomputeSummary(tx, d.db, reportId, { [zoneId]: { state, earliestOpenDeadline: zone.earliestOpenDeadline } });
    tx.update(zoneRef, { state, approvedBy: c.uid, approvedAt: now });
    tx.update(reportRef, { zoneSummary });
    return { report: toRef(report), zoneName: zone.name };
  });
  await notifyAfterCommit(d, { kind: 'zone_approved', ...notice, zoneId });
}

export async function approveAllWithoutFeedback(c: Caller, data: { reportId: string }, d: Deps): Promise<{ approved: number }> {
  requireReviewer(c);
  const reportId = docId(data?.reportId, 'reportId');
  const now = d.now();
  const reportRef = d.db.doc(`reports/${reportId}`);

  const { report, approved } = await d.db.runTransaction(async (tx) => {
    const reportSnap = await tx.get(reportRef);
    const report = existing<ReportDoc>(reportSnap, 'Report');
    requireReviewerFor(c, report);
    requireSent(report);

    // Only zones that never got feedback: a corrected zone is approved one by one, after the before/after comparison.
    const zones = (await tx.get(reportRef.collection('zones'))).docs.map((s) => s.data() as ZoneDoc);
    const approvedStates = new Map(zones.filter((z) => z.state === 'submitted').map((z) => [z.id, applyTransition(z.state, 'approve')]));
    if (approvedStates.size > 0) {
      // All zones were read above, so the summary is built from them in memory instead of re-reading via recomputeSummary.
      const zoneSummary = summarize(zones.map((z) => ({ ...z, state: approvedStates.get(z.id) ?? z.state })));
      for (const [id, state] of approvedStates) {
        tx.update(reportRef.collection('zones').doc(id), { state, approvedBy: c.uid, approvedAt: now });
      }
      tx.update(reportRef, { zoneSummary });
    }
    return { report: toRef(report), approved: approvedStates.size };
  });
  if (approved > 0) await notifyAfterCommit(d, { kind: 'all_approved', report, count: approved });
  return { approved };
}
