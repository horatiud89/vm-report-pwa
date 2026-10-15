import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { FunctionsErrorCode } from 'firebase-functions/https';
import type { FeedbackDoc, PhotoRef, ReportDoc, ZoneDoc } from '@shared/types';
import { createDraft } from '../src/draft';
import { approveAllWithoutFeedback, approveZone, giveFeedback, sendCorrection } from '../src/review';
import {
  NOW, ZONE_IDS, avmCz, avmSk, createSentReport, director, headVm, otherStoreCaller, photoPath, putPhoto, resetData, seedStore850,
  storeCaller, testDeps,
} from './helpers';

const d = testDeps();
const ZONE = 'women-image';
const OTHER_ZONE = 'women-wall-1';
const SKIPPED_ZONE = 'window-window-2';
const REPORT_REF = { storeId: '850', storeCode: '850', storeName: 'Palladium Praha', country: 'CZ', campaignName: 'Autumn 2026' };

const fails = (promise: Promise<unknown>, code: FunctionsErrorCode) => expect(promise).rejects.toMatchObject({ code });
const getReport = async (id: string) => (await d.db.doc(`reports/${id}`).get()).data() as ReportDoc;
const getZone = async (id: string, zoneId: string) => (await d.db.doc(`reports/${id}/zones/${zoneId}`).get()).data() as ZoneDoc;
const getFeedback = async (id: string, zoneId: string) => (
  (await d.db.collection(`reports/${id}/zones/${zoneId}/feedback`).get()).docs.map((s) => s.data() as FeedbackDoc)
);
async function sentReport(): Promise<string> {
  const reportId = await createSentReport(d, [SKIPPED_ZONE]);
  d.notifier.events.length = 0;   // the fixture's report_sent event is not under test
  return reportId;
}

/** The report's zoneSummary must always equal what the zone documents say. */
async function expectSummaryInSync(reportId: string) {
  const zones = (await d.db.collection(`reports/${reportId}/zones`).get()).docs.map((s) => s.data() as ZoneDoc);
  expect(zones).toHaveLength(ZONE_IDS.length);
  expect((await getReport(reportId)).zoneSummary).toEqual(
    Object.fromEntries(zones.map((z) => [z.id, { state: z.state, deadline: z.earliestOpenDeadline }])),
  );
}

type FeedbackArgs = Parameters<typeof giveFeedback>[1];
const feedbackArgs = (reportId: string, patch: Partial<FeedbackArgs> = {}): FeedbackArgs => ({
  reportId, zoneId: ZONE, version: 1, photoIndex: 0, comment: 'Straighten the shirts', strokes: [{ points: [0.1, 0.2, 0.3, 0.4] }],
  deadline: '2026-10-20', ...patch,
});
const give = (reportId: string, patch: Partial<FeedbackArgs> = {}, who = avmCz) => giveFeedback(who, feedbackArgs(reportId, patch), d);

/** Uploads a fresh photo for the zone and sends it as the store's correction. */
async function correct(reportId: string, zoneId = ZONE, patch: { photos?: PhotoRef[]; storeComment?: string } = {}) {
  const file = `fix-${(await getZone(reportId, zoneId)).versions.length + 1}.jpg`;
  const photos = patch.photos ?? [await putPhoto(d.bucket, photoPath(reportId, zoneId, file))];
  await sendCorrection(storeCaller, { reportId, zoneId, photos, storeComment: patch.storeComment ?? 'Done' }, d);
}

beforeEach(async () => {
  d.notifier.events.length = 0;
  await resetData(d);
  await seedStore850(d.db);
});

describe('giveFeedback', () => {
  test('a reviewer of the country stores the feedback, moves the zone to needs_correction and notifies', async () => {
    const reportId = await sentReport();

    const { feedbackId } = await give(reportId);

    const stored = await d.db.doc(`reports/${reportId}/zones/${ZONE}/feedback/${feedbackId}`).get();
    expect(stored.data()).toEqual({
      id: feedbackId, authorUid: avmCz.uid, authorRole: 'avm', authorName: 'Area VM', version: 1, photoIndex: 0,
      comment: 'Straighten the shirts', strokes: [{ points: [0.1, 0.2, 0.3, 0.4] }], deadline: '2026-10-20', createdAt: NOW, status: 'open',
    });
    expect(await getZone(reportId, ZONE)).toMatchObject({ state: 'needs_correction', earliestOpenDeadline: '2026-10-20' });
    expect((await getReport(reportId)).zoneSummary[ZONE]).toEqual({ state: 'needs_correction', deadline: '2026-10-20' });
    expect((await getZone(reportId, OTHER_ZONE)).state).toBe('submitted');
    await expectSummaryInSync(reportId);
    expect(d.notifier.events).toEqual([{
      kind: 'feedback', report: { id: reportId, ...REPORT_REF }, zoneId: ZONE, zoneName: "Women's Image", deadline: '2026-10-20',
    }]);
  });

  test('head of VM and director review every country; the comment is trimmed', async () => {
    const reportId = await sentReport();
    await give(reportId, { comment: '  from head  ' }, headVm);
    await give(reportId, { comment: 'from director', photoIndex: 0 }, director);
    const feedback = await getFeedback(reportId, ZONE);
    expect(feedback.map((f) => [f.authorRole, f.authorName, f.comment]).sort()).toEqual([
      ['director', 'Director of Operations', 'from director'], ['head_vm', 'Head of VM', 'from head'],
    ]);
  });

  test('a reviewer of another country and the store get permission-denied', async () => {
    const reportId = await sentReport();
    await fails(give(reportId, {}, avmSk), 'permission-denied');
    await fails(give(reportId, {}, storeCaller), 'permission-denied');
    await fails(give(reportId, {}, otherStoreCaller), 'permission-denied');
    expect(await getFeedback(reportId, ZONE)).toEqual([]);
    expect((await getZone(reportId, ZONE)).state).toBe('submitted');
    expect(d.notifier.events).toEqual([]);
  });

  test('giveFeedback rejects deadline before store-local today', async () => {
    const reportId = await sentReport();
    await fails(give(reportId, { deadline: '2026-10-14' }), 'invalid-argument');
    await fails(give(reportId, { deadline: '2025-12-31' }), 'invalid-argument');
    expect(await getFeedback(reportId, ZONE)).toEqual([]);
    expect((await getZone(reportId, ZONE)).state).toBe('submitted');
    // Today in the store's own calendar is fine.
    await give(reportId, { deadline: '2026-10-15' });
    expect((await getZone(reportId, ZONE)).earliestOpenDeadline).toBe('2026-10-15');
  });

  test('"today" is the store-local date, not the UTC date', async () => {
    const reportId = await sentReport();
    // 23:30 UTC on 14 October is already 15 October, 01:30 in Prague.
    const lateEvening = { ...d, now: () => Date.UTC(2026, 9, 14, 23, 30) };
    await fails(giveFeedback(avmCz, feedbackArgs(reportId, { deadline: '2026-10-14' }), lateEvening), 'invalid-argument');
    await giveFeedback(avmCz, feedbackArgs(reportId, { deadline: '2026-10-15' }), lateEvening);
    expect((await getZone(reportId, ZONE)).earliestOpenDeadline).toBe('2026-10-15');
  });

  test('rejects malformed deadlines', async () => {
    const reportId = await sentReport();
    for (const deadline of ['2026-02-30', '20.10.2026', '2026-10-2', 'tomorrow', '', 20261020, null, undefined]) {
      await fails(give(reportId, { deadline } as unknown as Partial<FeedbackArgs>), 'invalid-argument');
    }
    expect(await getFeedback(reportId, ZONE)).toEqual([]);
  });

  test('rejects strokes with a value outside 0..1, odd or oversized point lists and malformed shapes', async () => {
    const reportId = await sentReport();
    const bad: unknown[] = [
      [{ points: [0.1, 1.5] }],
      [{ points: [-0.1, 0.5] }],
      [{ points: [0.1, 0.2, 0.3] }],
      [{ points: Array<number>(2002).fill(0.5) }],
      [{ points: ['0.1', '0.2'] }],
      [{ points: [Number.NaN, 0.2] }],
      [{ points: 'abc' }],
      [{}],
      [null],
      Array.from({ length: 51 }, () => ({ points: [0.1, 0.2] })),
      'circle',
      { points: [0.1, 0.2] },
      undefined,
    ];
    for (const strokes of bad) await fails(give(reportId, { strokes } as unknown as Partial<FeedbackArgs>), 'invalid-argument');
    expect(await getFeedback(reportId, ZONE)).toEqual([]);
  });

  test('accepts no strokes, 50 strokes and 2000 values per stroke, at the edges 0 and 1', async () => {
    const reportId = await sentReport();
    await give(reportId, { strokes: [] });
    await give(reportId, { strokes: Array.from({ length: 50 }, () => ({ points: [0, 1, 1, 0] })) });
    await give(reportId, { strokes: [{ points: Array<number>(2000).fill(0.5) }] });
    expect(await getFeedback(reportId, ZONE)).toHaveLength(3);
  });

  test('stores only points of each stroke', async () => {
    const reportId = await sentReport();
    const { feedbackId } = await give(reportId, { strokes: [{ points: [0.5, 0.5], evil: 'x' } as { points: number[] }] });
    const stored = (await d.db.doc(`reports/${reportId}/zones/${ZONE}/feedback/${feedbackId}`).get()).data() as FeedbackDoc;
    expect(stored.strokes).toEqual([{ points: [0.5, 0.5] }]);
  });

  test('the comment is required, at most 1000 characters', async () => {
    const reportId = await sentReport();
    for (const comment of ['', '   \n\t ', 'x'.repeat(1001), 5, null, undefined]) {
      await fails(give(reportId, { comment } as unknown as Partial<FeedbackArgs>), 'invalid-argument');
    }
    await give(reportId, { comment: 'x'.repeat(1000) });
    expect(await getFeedback(reportId, ZONE)).toHaveLength(1);
  });

  test('feedback on a not_in_campaign zone is a failed-precondition', async () => {
    const reportId = await sentReport();
    await fails(give(reportId, { zoneId: SKIPPED_ZONE }), 'failed-precondition');
    expect((await getZone(reportId, SKIPPED_ZONE)).state).toBe('not_in_campaign');
    expect(d.notifier.events).toEqual([]);
  });

  test('only the latest version can be commented on (R3); the photo index must exist', async () => {
    const reportId = await sentReport();
    await give(reportId);
    await correct(reportId);

    await fails(give(reportId, { version: 1 }), 'failed-precondition');   // superseded photos
    await fails(give(reportId, { version: 3 }), 'invalid-argument');      // does not exist
    for (const version of [0, -1, 1.5, '2', null]) {
      await fails(give(reportId, { version } as unknown as Partial<FeedbackArgs>), 'invalid-argument');
    }
    for (const photoIndex of [1, 3, -1, 0.5, '0', null]) {
      await fails(give(reportId, { version: 2, photoIndex } as unknown as Partial<FeedbackArgs>), 'invalid-argument');
    }
    expect(await getFeedback(reportId, ZONE)).toHaveLength(1);

    const { feedbackId } = await give(reportId, { version: 2 });
    const stored = (await d.db.doc(`reports/${reportId}/zones/${ZONE}/feedback/${feedbackId}`).get()).data() as FeedbackDoc;
    expect(stored).toMatchObject({ version: 2, photoIndex: 0, status: 'open' });
    expect((await getZone(reportId, ZONE)).state).toBe('needs_correction');
  });

  test('photoIndex can address any photo of the latest version', async () => {
    const reportId = await sentReport();
    await give(reportId);
    const photos = await Promise.all(['x', 'y', 'z'].map((n) => putPhoto(d.bucket, photoPath(reportId, ZONE, `${n}.jpg`))));
    await sendCorrection(storeCaller, { reportId, zoneId: ZONE, photos, storeComment: '' }, d);
    await give(reportId, { version: 2, photoIndex: 2 });
    await fails(give(reportId, { version: 2, photoIndex: 3 }), 'invalid-argument');
  });

  test('two feedbacks with later and then earlier deadlines keep the earliest open deadline', async () => {
    const reportId = await sentReport();
    await give(reportId, { deadline: '2026-10-20' });
    expect((await getZone(reportId, ZONE)).earliestOpenDeadline).toBe('2026-10-20');
    await give(reportId, { deadline: '2026-10-18', comment: 'second' });

    expect((await getZone(reportId, ZONE)).earliestOpenDeadline).toBe('2026-10-18');
    expect((await getReport(reportId)).zoneSummary[ZONE]).toEqual({ state: 'needs_correction', deadline: '2026-10-18' });

    await give(reportId, { deadline: '2026-10-25', comment: 'third' });
    expect((await getZone(reportId, ZONE)).earliestOpenDeadline).toBe('2026-10-18');
    expect(await getFeedback(reportId, ZONE)).toHaveLength(3);
    await expectSummaryInSync(reportId);
  });

  test('concurrent feedback on one zone ends with the earliest deadline and every feedback stored', async () => {
    const reportId = await sentReport();
    await Promise.all(['2026-10-20', '2026-10-18', '2026-10-19'].map((deadline) => give(reportId, { deadline })));
    expect((await getZone(reportId, ZONE)).earliestOpenDeadline).toBe('2026-10-18');
    expect(await getFeedback(reportId, ZONE)).toHaveLength(3);
    await expectSummaryInSync(reportId);
  });

  test('dayBeforeAlreadyCovered deadlines pre-set the day-before reminder flag, others leave it null (R7)', async () => {
    const reportId = await sentReport();
    // NOW is 2026-10-15 in Prague: for a deadline of 16th (or 15th) the day-before moment is today or already past.
    await give(reportId, { zoneId: ZONE, deadline: '2026-10-16' });
    await give(reportId, { zoneId: 'women-wall-2', deadline: '2026-10-15' });
    // For the 17th the day-before moment (16th, 09:00) is still ahead, so the reminder job must send it.
    await give(reportId, { zoneId: OTHER_ZONE, deadline: '2026-10-17' });
    await give(reportId, { zoneId: 'women-wall-3', deadline: '2026-11-30' });

    expect((await getZone(reportId, ZONE)).reminderDayBeforeSentFor).toBe('2026-10-16');
    expect((await getZone(reportId, 'women-wall-2')).reminderDayBeforeSentFor).toBe('2026-10-15');
    expect((await getZone(reportId, OTHER_ZONE)).reminderDayBeforeSentFor).toBeNull();
    expect((await getZone(reportId, 'women-wall-3')).reminderDayBeforeSentFor).toBeNull();
    for (const zoneId of [ZONE, 'women-wall-2', OTHER_ZONE, 'women-wall-3']) {
      expect((await getZone(reportId, zoneId)).reminderOverdueSentFor).toBeNull();
    }
  });

  test('a later deadline never touches the flag of the earliest one; an earlier one leaves existing flags alone', async () => {
    const reportId = await sentReport();
    await give(reportId, { deadline: '2026-10-15' });                       // covered: flag = 15th
    await give(reportId, { deadline: '2026-10-16' });                       // covered too, but later than the earliest (15th)
    expect(await getZone(reportId, ZONE)).toMatchObject({ earliestOpenDeadline: '2026-10-15', reminderDayBeforeSentFor: '2026-10-15' });

    // A zone whose reminders were already sent for the 20th; an earlier deadline arrives (not covered).
    await give(reportId, { zoneId: OTHER_ZONE, deadline: '2026-10-20' });
    await d.db.doc(`reports/${reportId}/zones/${OTHER_ZONE}`).update({ reminderDayBeforeSentFor: '2026-10-20', reminderOverdueSentFor: '2026-10-20' });
    await give(reportId, { zoneId: OTHER_ZONE, deadline: '2026-10-18' });
    expect(await getZone(reportId, OTHER_ZONE)).toMatchObject({
      earliestOpenDeadline: '2026-10-18', reminderDayBeforeSentFor: '2026-10-20', reminderOverdueSentFor: '2026-10-20',
    });
  });

  test('feedback after a correction puts the zone back to needs_correction, older feedback stays answered', async () => {
    const reportId = await sentReport();
    const { feedbackId: first } = await give(reportId, { deadline: '2026-10-20' });
    await correct(reportId);
    const { feedbackId: second } = await give(reportId, { version: 2, deadline: '2026-10-22' });

    expect(await getZone(reportId, ZONE)).toMatchObject({ state: 'needs_correction', earliestOpenDeadline: '2026-10-22' });
    const byId = Object.fromEntries((await getFeedback(reportId, ZONE)).map((f) => [f.id, f.status]));
    expect(byId).toEqual({ [first]: 'answered', [second]: 'open' });
    await expectSummaryInSync(reportId);
  });

  test('feedback on an approved zone puts it back to needs_correction and withdraws the approval', async () => {
    const reportId = await sentReport();
    await approveZone(avmCz, { reportId, zoneId: ZONE }, d);
    expect(await getZone(reportId, ZONE)).toMatchObject({ state: 'approved', approvedBy: avmCz.uid, approvedAt: NOW });

    await give(reportId, {}, headVm);

    expect(await getZone(reportId, ZONE)).toMatchObject({ state: 'needs_correction', approvedBy: null, approvedAt: null });
    await expectSummaryInSync(reportId);
  });

  test('unknown report or zone is not-found, a bad id is invalid-argument, a draft report a failed-precondition', async () => {
    const reportId = await sentReport();
    await fails(give('missing'), 'not-found');
    await fails(give(reportId, { zoneId: 'no-such-zone' }), 'not-found');
    await fails(give(reportId, { zoneId: '' }), 'invalid-argument');
    await fails(give(reportId, { zoneId: 'a/b' }), 'invalid-argument');
    await fails(give(undefined as unknown as string), 'invalid-argument');

    await d.db.doc(`reports/${reportId}`).update({ status: 'draft' });
    await fails(give(reportId), 'failed-precondition');
  });

  test('a notifier failure after the commit does not fail the call', async () => {
    const reportId = await sentReport();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = { ...d, notifier: { notify: () => Promise.reject(new Error('push down')) } };
    await giveFeedback(avmCz, feedbackArgs(reportId), failing);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
    expect((await getZone(reportId, ZONE)).state).toBe('needs_correction');
  });
});

describe('sendCorrection', () => {
  test('appends version 2, answers the open feedback, clears the deadline and notifies', async () => {
    const reportId = await sentReport();
    const { feedbackId } = await give(reportId);
    d.notifier.events.length = 0;
    const photos = [await putPhoto(d.bucket, photoPath(reportId, ZONE, 'new-1.jpg')), await putPhoto(d.bucket, photoPath(reportId, ZONE, 'new-2.jpg'))];

    await sendCorrection(storeCaller, { reportId, zoneId: ZONE, photos, storeComment: '  Restyled  ' }, d);

    const zone = await getZone(reportId, ZONE);
    expect(zone).toMatchObject({ state: 'correction_sent', earliestOpenDeadline: null });
    expect(zone.versions).toHaveLength(2);
    expect(zone.versions[0]).toMatchObject({ n: 1, storeComment: '' });
    expect(zone.versions[0].photos).toHaveLength(1);
    expect(zone.versions[1]).toEqual({ n: 2, photos, storeComment: 'Restyled', createdAt: NOW });
    expect((await getFeedback(reportId, ZONE)).map((f) => [f.id, f.status])).toEqual([[feedbackId, 'answered']]);
    expect((await getReport(reportId)).zoneSummary[ZONE]).toEqual({ state: 'correction_sent', deadline: null });
    await expectSummaryInSync(reportId);
    expect(d.notifier.events).toEqual([{
      kind: 'correction_sent', report: { id: reportId, ...REPORT_REF }, zoneId: ZONE, zoneName: "Women's Image",
    }]);
  });

  test('one correction answers every open feedback of the zone and leaves other zones alone', async () => {
    const reportId = await sentReport();
    await give(reportId, { deadline: '2026-10-20' }, avmCz);
    await give(reportId, { deadline: '2026-10-18' }, headVm);
    const { feedbackId: other } = await give(reportId, { zoneId: OTHER_ZONE });

    await correct(reportId);

    expect((await getFeedback(reportId, ZONE)).map((f) => f.status)).toEqual(['answered', 'answered']);
    expect((await getFeedback(reportId, OTHER_ZONE)).map((f) => [f.id, f.status])).toEqual([[other, 'open']]);
    expect(await getZone(reportId, OTHER_ZONE)).toMatchObject({ state: 'needs_correction', earliestOpenDeadline: '2026-10-20' });
    await expectSummaryInSync(reportId);
  });

  test('a second round of feedback and correction numbers the versions 2 and 3', async () => {
    const reportId = await sentReport();
    await give(reportId);
    await correct(reportId);
    await give(reportId, { version: 2 });
    await correct(reportId);
    expect((await getZone(reportId, ZONE)).versions.map((v) => v.n)).toEqual([1, 2, 3]);
  });

  test('only a zone in needs_correction can be corrected', async () => {
    const reportId = await sentReport();
    const photo = await putPhoto(d.bucket, photoPath(reportId, ZONE, 'x.jpg'));
    const call = (zoneId: string) => sendCorrection(storeCaller, { reportId, zoneId, photos: [{ ...photo, path: photoPath(reportId, zoneId, 'x.jpg') }], storeComment: '' }, d);
    await putPhoto(d.bucket, photoPath(reportId, SKIPPED_ZONE, 'x.jpg'));

    await fails(call(ZONE), 'failed-precondition');            // submitted
    await fails(call(SKIPPED_ZONE), 'failed-precondition');    // not_in_campaign
    await approveZone(avmCz, { reportId, zoneId: ZONE }, d);
    await fails(call(ZONE), 'failed-precondition');            // approved
    await give(reportId);
    await correct(reportId);
    await fails(call(ZONE), 'failed-precondition');            // correction_sent
    expect((await getZone(reportId, ZONE)).versions).toHaveLength(2);
  });

  test('another store and reviewers get permission-denied', async () => {
    const reportId = await sentReport();
    await give(reportId);
    const photos = [await putPhoto(d.bucket, photoPath(reportId, ZONE, 'x.jpg'))];
    const args = { reportId, zoneId: ZONE, photos, storeComment: '' };
    await fails(sendCorrection(otherStoreCaller, args, d), 'permission-denied');
    for (const reviewer of [avmCz, avmSk, headVm, director]) await fails(sendCorrection(reviewer, args, d), 'permission-denied');
    expect(await getZone(reportId, ZONE)).toMatchObject({ state: 'needs_correction' });
    expect((await getZone(reportId, ZONE)).versions).toHaveLength(1);
  });

  test('photos: 1 to 3, in the zone folder, existing, without duplicates', async () => {
    const reportId = await sentReport();
    await give(reportId);
    const ok = await putPhoto(d.bucket, photoPath(reportId, ZONE, 'ok.jpg'));
    const names = ['a', 'b', 'c', 'd'];
    const four = await Promise.all(names.map((n) => putPhoto(d.bucket, photoPath(reportId, ZONE, `${n}.jpg`))));
    const elsewhere = await putPhoto(d.bucket, photoPath(reportId, OTHER_ZONE, 'ok.jpg'));
    const send = (photos: unknown, storeComment: unknown = '') => (
      sendCorrection(storeCaller, { reportId, zoneId: ZONE, photos, storeComment } as Parameters<typeof sendCorrection>[1], d)
    );

    await fails(send([]), 'invalid-argument');
    await fails(send(four), 'invalid-argument');
    await fails(send('nope'), 'invalid-argument');
    await fails(send([{ path: ok.path }]), 'invalid-argument');
    await fails(send([ok, ok]), 'invalid-argument');
    await fails(send([{ ...ok, path: photoPath(reportId, ZONE, 'never-uploaded.jpg') }]), 'invalid-argument');
    await fails(send([elsewhere]), 'invalid-argument');
    await fails(send([ok], 'x'.repeat(501)), 'invalid-argument');
    await fails(send([ok], 5), 'invalid-argument');
    expect((await getZone(reportId, ZONE)).versions).toHaveLength(1);
    expect((await getFeedback(reportId, ZONE)).map((f) => f.status)).toEqual(['open']);

    await send(four.slice(0, 3), 'x'.repeat(500));
    expect((await getZone(reportId, ZONE)).versions[1].photos).toEqual(four.slice(0, 3));
  });

  test('the store comment may be empty and is limited to 500 characters after trimming', async () => {
    const reportId = await sentReport();
    await give(reportId);
    await correct(reportId, ZONE, { storeComment: `${'x'.repeat(500)}   ` });
    expect((await getZone(reportId, ZONE)).versions[1].storeComment).toHaveLength(500);
  });

  test('unknown report or zone is not-found', async () => {
    const reportId = await sentReport();
    const photos = [await putPhoto(d.bucket, photoPath(reportId, ZONE, 'x.jpg'))];
    await fails(sendCorrection(storeCaller, { reportId: 'missing', zoneId: ZONE, photos, storeComment: '' }, d), 'not-found');
    await fails(sendCorrection(storeCaller, { reportId, zoneId: 'no-such-zone', photos, storeComment: '' }, d), 'not-found');
    await fails(sendCorrection(storeCaller, { reportId, zoneId: '', photos, storeComment: '' }, d), 'invalid-argument');
  });
});

describe('approveZone', () => {
  test('approves a corrected zone, records who and when, and notifies', async () => {
    const reportId = await sentReport();
    await give(reportId);
    await correct(reportId);
    d.notifier.events.length = 0;

    await approveZone(headVm, { reportId, zoneId: ZONE }, d);

    expect(await getZone(reportId, ZONE)).toMatchObject({ state: 'approved', approvedBy: headVm.uid, approvedAt: NOW, earliestOpenDeadline: null });
    expect((await getReport(reportId)).zoneSummary[ZONE]).toEqual({ state: 'approved', deadline: null });
    await expectSummaryInSync(reportId);
    expect(d.notifier.events).toEqual([{ kind: 'zone_approved', report: { id: reportId, ...REPORT_REF }, zoneId: ZONE, zoneName: "Women's Image" }]);
  });

  test('approves a submitted zone', async () => {
    const reportId = await sentReport();
    await approveZone(avmCz, { reportId, zoneId: OTHER_ZONE }, d);
    expect(await getZone(reportId, OTHER_ZONE)).toMatchObject({ state: 'approved', approvedBy: avmCz.uid });
    expect((await getZone(reportId, ZONE)).state).toBe('submitted');
    await expectSummaryInSync(reportId);
  });

  test('approve after feedback fails with failed-precondition', async () => {
    const reportId = await sentReport();
    await give(reportId);
    d.notifier.events.length = 0;

    await fails(approveZone(headVm, { reportId, zoneId: ZONE }, d), 'failed-precondition');

    expect(await getZone(reportId, ZONE)).toMatchObject({ state: 'needs_correction', approvedBy: null, approvedAt: null });
    await expectSummaryInSync(reportId);
    expect(d.notifier.events).toEqual([]);
  });

  test('approving twice and approving a not_in_campaign zone are failed-preconditions', async () => {
    const reportId = await sentReport();
    await approveZone(avmCz, { reportId, zoneId: ZONE }, d);
    await fails(approveZone(headVm, { reportId, zoneId: ZONE }, d), 'failed-precondition');
    await fails(approveZone(avmCz, { reportId, zoneId: SKIPPED_ZONE }, d), 'failed-precondition');
    expect((await getZone(reportId, ZONE)).approvedBy).toBe(avmCz.uid);
    expect(d.notifier.events.filter((e) => e.kind === 'zone_approved')).toHaveLength(1);
  });

  test('the store and a reviewer of another country get permission-denied', async () => {
    const reportId = await sentReport();
    await fails(approveZone(storeCaller, { reportId, zoneId: ZONE }, d), 'permission-denied');
    await fails(approveZone(avmSk, { reportId, zoneId: ZONE }, d), 'permission-denied');
    expect((await getZone(reportId, ZONE)).state).toBe('submitted');
  });

  test('unknown report or zone is not-found, a bad id invalid-argument, a draft report a failed-precondition', async () => {
    const reportId = await sentReport();
    await fails(approveZone(avmCz, { reportId: 'missing', zoneId: ZONE }, d), 'not-found');
    await fails(approveZone(avmCz, { reportId, zoneId: 'no-such-zone' }, d), 'not-found');
    await fails(approveZone(avmCz, { reportId, zoneId: '' }, d), 'invalid-argument');
    await fails(approveZone(avmCz, {} as { reportId: string; zoneId: string }, d), 'invalid-argument');

    const { reportId: draftId } = await createDraft(storeCaller, { campaignName: 'Winter' }, d);
    await fails(approveZone(avmCz, { reportId: draftId, zoneId: ZONE }, d), 'failed-precondition');
  });
});

describe('approveAllWithoutFeedback', () => {
  test('approves only submitted zones, leaves the others, returns the count and notifies once', async () => {
    const reportId = await sentReport();
    await give(reportId, { zoneId: ZONE });                 // needs_correction
    await give(reportId, { zoneId: OTHER_ZONE });
    await correct(reportId, OTHER_ZONE);                    // correction_sent
    await approveZone(avmCz, { reportId, zoneId: 'women-wall-2' }, d);   // already approved by someone else
    d.notifier.events.length = 0;

    const result = await approveAllWithoutFeedback(headVm, { reportId }, d);

    const submittedBefore = ZONE_IDS.length - 1 /* not_in_campaign */ - 3;
    expect(result).toEqual({ approved: submittedBefore });
    expect((await getZone(reportId, ZONE)).state).toBe('needs_correction');
    expect((await getZone(reportId, OTHER_ZONE)).state).toBe('correction_sent');
    expect((await getZone(reportId, SKIPPED_ZONE)).state).toBe('not_in_campaign');
    expect(await getZone(reportId, 'women-wall-2')).toMatchObject({ state: 'approved', approvedBy: avmCz.uid });
    const approved = (await d.db.collection(`reports/${reportId}/zones`).where('state', '==', 'approved').get()).docs.map((s) => s.data() as ZoneDoc);
    expect(approved).toHaveLength(submittedBefore + 1);
    for (const z of approved.filter((x) => x.id !== 'women-wall-2')) expect(z).toMatchObject({ approvedBy: headVm.uid, approvedAt: NOW });
    await expectSummaryInSync(reportId);
    expect(d.notifier.events).toEqual([{ kind: 'all_approved', report: { id: reportId, ...REPORT_REF }, count: submittedBefore }]);
  });

  test('with nothing submitted it approves 0 zones and sends no event', async () => {
    const reportId = await sentReport();
    await approveAllWithoutFeedback(avmCz, { reportId }, d);
    d.notifier.events.length = 0;

    expect(await approveAllWithoutFeedback(avmCz, { reportId }, d)).toEqual({ approved: 0 });
    expect(d.notifier.events).toEqual([]);
    await expectSummaryInSync(reportId);
  });

  test('the store and a reviewer of another country get permission-denied and nothing changes', async () => {
    const reportId = await sentReport();
    await fails(approveAllWithoutFeedback(storeCaller, { reportId }, d), 'permission-denied');
    await fails(approveAllWithoutFeedback(avmSk, { reportId }, d), 'permission-denied');
    expect((await getZone(reportId, ZONE)).state).toBe('submitted');
    expect(d.notifier.events).toEqual([]);
  });

  test('unknown report is not-found, a bad id invalid-argument, a draft report a failed-precondition', async () => {
    await fails(approveAllWithoutFeedback(avmCz, { reportId: 'missing' }, d), 'not-found');
    await fails(approveAllWithoutFeedback(avmCz, {} as { reportId: string }, d), 'invalid-argument');
    const { reportId } = await createDraft(storeCaller, { campaignName: 'Winter' }, d);
    await fails(approveAllWithoutFeedback(avmCz, { reportId }, d), 'failed-precondition');
  });
});
