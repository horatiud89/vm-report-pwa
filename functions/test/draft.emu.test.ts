import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { FunctionsErrorCode } from 'firebase-functions/https';
import { MAX_PHOTOS } from '@shared/status';
import type { PhotoRef, ReportDoc, ZoneDoc } from '@shared/types';
import { createDraft, markSeen, sendReport, updateDraftZone } from '../src/draft';
import {
  NOW, ZONE_IDS, avmCz, avmSk, director, headVm, otherStoreCaller, photoPath, putPhoto, resetData, seedStore850,
  storeCaller, testDeps,
} from './helpers';

const d = testDeps();
const CAMPAIGN = 'Autumn 2026';

const fails = (promise: Promise<unknown>, code: FunctionsErrorCode) => expect(promise).rejects.toMatchObject({ code });
const getReport = async (id: string) => (await d.db.doc(`reports/${id}`).get()).data() as ReportDoc;
const getZone = async (id: string, zoneId: string) => (await d.db.doc(`reports/${id}/zones/${zoneId}`).get()).data() as ZoneDoc;

async function draft(): Promise<string> {
  return (await createDraft(storeCaller, { campaignName: CAMPAIGN }, d)).reportId;
}

async function saveZone(reportId: string, zoneId: string, photos: PhotoRef[], extra: { storeComment?: string; notInCampaign?: boolean } = {}) {
  await updateDraftZone(storeCaller, { reportId, zoneId, photos, storeComment: extra.storeComment ?? '', notInCampaign: extra.notInCampaign ?? false }, d);
}

/** Every zone gets one uploaded photo, except the listed ones which are marked not part of the campaign. */
async function fillAllZones(reportId: string, notInCampaign: string[] = []) {
  const photos = await Promise.all(ZONE_IDS.map((zoneId) => (
    notInCampaign.includes(zoneId) ? [] : putPhoto(d.bucket, photoPath(reportId, zoneId)).then((p) => [p])
  )));
  // One at a time, like the app does: every save rewrites the report summary, so parallel saves would only contend.
  for (const [i, zoneId] of ZONE_IDS.entries()) {
    await saveZone(reportId, zoneId, photos[i], { notInCampaign: notInCampaign.includes(zoneId) });
  }
}

beforeEach(async () => {
  d.notifier.events.length = 0;
  await resetData(d);
  await seedStore850(d.db);
});

describe('createDraft', () => {
  test('creates a draft report with 33 empty zones and a matching summary', async () => {
    const reportId = await draft();

    const report = await getReport(reportId);
    expect(report).toMatchObject({
      id: reportId, storeId: '850', storeCode: '850', storeName: 'Palladium Praha', country: 'CZ', timezone: 'Europe/Prague',
      campaignName: CAMPAIGN, status: 'draft', createdAt: NOW, sentAt: null, seenBy: [],
    });
    expect(Object.keys(report.zoneSummary)).toHaveLength(33);
    expect(Object.values(report.zoneSummary).every((z) => z.state === 'empty' && z.deadline === null)).toBe(true);

    const zones = (await d.db.collection(`reports/${reportId}/zones`).get()).docs.map((s) => s.data() as ZoneDoc);
    expect(zones).toHaveLength(33);
    expect(zones.map((z) => z.id).sort()).toEqual([...ZONE_IDS].sort());
    for (const z of zones) {
      expect(z).toMatchObject({
        reportId, storeId: '850', country: 'CZ', state: 'empty', earliestOpenDeadline: null,
        reminderDayBeforeSentFor: null, reminderOverdueSentFor: null, approvedBy: null, approvedAt: null,
        versions: [{ n: 1, photos: [], storeComment: '', createdAt: NOW }],
      });
    }
    expect(zones.find((z) => z.id === 'women-image')).toMatchObject({ name: "Women's Image", departmentId: 'women', order: 0 });
    expect(zones.find((z) => z.id === 'window-window-2')).toMatchObject({ name: 'Window 2', departmentId: 'window', order: 32 });
  });

  test('trims the campaign name', async () => {
    const { reportId } = await createDraft(storeCaller, { campaignName: '  Autumn 2026  ' }, d);
    expect((await getReport(reportId)).campaignName).toBe('Autumn 2026');
  });

  test('a second draft for the same store is a failed-precondition', async () => {
    await draft();
    await fails(createDraft(storeCaller, { campaignName: 'Winter' }, d), 'failed-precondition');
  });

  test('concurrent createDraft calls produce exactly one draft', async () => {
    const results = await Promise.allSettled([draft(), draft()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const drafts = await d.db.collection('reports').where('status', '==', 'draft').get();
    expect(drafts.size).toBe(1);
  });

  test('a new draft is allowed once the previous report was sent', async () => {
    const first = await draft();
    await fillAllZones(first);
    await sendReport(storeCaller, { reportId: first }, d);
    const { reportId: second } = await createDraft(storeCaller, { campaignName: 'Winter' }, d);
    expect(second).not.toBe(first);
  });

  test('reviewers cannot create a draft', async () => {
    for (const reviewer of [avmCz, headVm, director]) {
      await fails(createDraft(reviewer, { campaignName: CAMPAIGN }, d), 'permission-denied');
    }
  });

  test('blank, missing, non-string and over-long campaign names are invalid-argument', async () => {
    await fails(createDraft(storeCaller, { campaignName: '   ' }, d), 'invalid-argument');
    await fails(createDraft(storeCaller, { campaignName: '' }, d), 'invalid-argument');
    await fails(createDraft(storeCaller, {} as { campaignName: string }, d), 'invalid-argument');
    await fails(createDraft(storeCaller, { campaignName: 7 } as unknown as { campaignName: string }, d), 'invalid-argument');
    await fails(createDraft(storeCaller, { campaignName: 'x'.repeat(81) }, d), 'invalid-argument');
    expect((await d.db.collection('reports').get()).size).toBe(0);
    const { reportId } = await createDraft(storeCaller, { campaignName: 'x'.repeat(80) }, d);
    expect((await getReport(reportId)).campaignName).toHaveLength(80);
  });

  test('an unknown store is not-found', async () => {
    await d.db.doc('stores/850').delete();
    await fails(draft(), 'not-found');
  });
});

describe('updateDraftZone', () => {
  test('one uploaded photo makes the zone photo_added and updates the summary', async () => {
    const reportId = await draft();
    const photo = await putPhoto(d.bucket, photoPath(reportId, 'women-image'));
    await saveZone(reportId, 'women-image', [photo], { storeComment: 'Fresh display' });

    expect(await getZone(reportId, 'women-image')).toMatchObject({
      state: 'photo_added', versions: [{ n: 1, photos: [photo], storeComment: 'Fresh display', createdAt: NOW }],
    });
    const summary = (await getReport(reportId)).zoneSummary;
    expect(summary['women-image']).toEqual({ state: 'photo_added', deadline: null });
    expect(summary['women-wall-1']).toEqual({ state: 'empty', deadline: null });
    expect(Object.keys(summary)).toHaveLength(33);
  });

  test('removing the photo again returns the zone to empty', async () => {
    const reportId = await draft();
    await saveZone(reportId, 'women-image', [await putPhoto(d.bucket, photoPath(reportId, 'women-image'))]);
    await saveZone(reportId, 'women-image', [], { storeComment: 'retaking' });
    expect(await getZone(reportId, 'women-image')).toMatchObject({ state: 'empty', versions: [{ n: 1, photos: [], storeComment: 'retaking' }] });
    expect((await getReport(reportId)).zoneSummary['women-image'].state).toBe('empty');
  });

  test('up to three photos are accepted', async () => {
    const reportId = await draft();
    const photos = await Promise.all(['a', 'b', 'c'].map((n) => putPhoto(d.bucket, photoPath(reportId, 'women-image', `${n}.jpg`))));
    expect(photos).toHaveLength(MAX_PHOTOS);
    await saveZone(reportId, 'women-image', photos);
    expect((await getZone(reportId, 'women-image')).versions[0].photos).toEqual(photos);
  });

  test('rejects missing photo paths', async () => {
    const reportId = await draft();
    const never: PhotoRef = { path: photoPath(reportId, 'women-image', 'never-uploaded.jpg'), width: 10, height: 10 };
    await fails(saveZone(reportId, 'women-image', [never]), 'invalid-argument');
    expect(await getZone(reportId, 'women-image')).toMatchObject({ state: 'empty', versions: [{ photos: [] }] });
  });

  test('rejects a photo path that belongs to another zone, report, store or country', async () => {
    const reportId = await draft();
    const paths = [
      photoPath(reportId, 'women-wall-1'),
      photoPath('other-report', 'women-image'),
      `reports/CZ/851/${reportId}/women-image/a.jpg`,
      `reports/SK/850/${reportId}/women-image/a.jpg`,
      `other/CZ/850/${reportId}/women-image/a.jpg`,
    ];
    for (const path of paths) {
      const photo = await putPhoto(d.bucket, path);
      await fails(saveZone(reportId, 'women-image', [photo]), 'invalid-argument');
    }
    expect(await getZone(reportId, 'women-image')).toMatchObject({ state: 'empty' });
  });

  test('rejects a path that is not a single file name inside the zone folder', async () => {
    const reportId = await draft();
    const nested = await putPhoto(d.bucket, `${photoPath(reportId, 'women-image', 'sub')}/a.jpg`);
    await fails(saveZone(reportId, 'women-image', [nested]), 'invalid-argument');
    const folderOnly: PhotoRef = { path: `reports/CZ/850/${reportId}/women-image/`, width: 1, height: 1 };
    await fails(saveZone(reportId, 'women-image', [folderOnly]), 'invalid-argument');
  });

  test('rejects the same photo path twice', async () => {
    const reportId = await draft();
    const photo = await putPhoto(d.bucket, photoPath(reportId, 'women-image'));
    await fails(saveZone(reportId, 'women-image', [photo, photo]), 'invalid-argument');
    await fails(saveZone(reportId, 'women-image', [photo, { ...photo, width: 5, height: 5 }]), 'invalid-argument');
    expect(await getZone(reportId, 'women-image')).toMatchObject({ state: 'empty', versions: [{ photos: [] }] });
  });

  test('rejects four photos', async () => {
    const reportId = await draft();
    const photos = await Promise.all(['a', 'b', 'c', 'd'].map((n) => putPhoto(d.bucket, photoPath(reportId, 'women-image', `${n}.jpg`))));
    await fails(saveZone(reportId, 'women-image', photos), 'invalid-argument');
  });

  test('rejects malformed input', async () => {
    const reportId = await draft();
    const ok = await putPhoto(d.bucket, photoPath(reportId, 'women-image'));
    const call = (patch: Record<string, unknown>) => updateDraftZone(
      storeCaller,
      { reportId, zoneId: 'women-image', photos: [ok], storeComment: '', notInCampaign: false, ...patch },
      d,
    );
    await fails(call({ photos: 'nope' }), 'invalid-argument');
    await fails(call({ photos: [{ path: ok.path }] }), 'invalid-argument');
    await fails(call({ photos: [{ path: 5, width: 1, height: 1 }] }), 'invalid-argument');
    await fails(call({ storeComment: 5 }), 'invalid-argument');
    await fails(call({ notInCampaign: 'yes' }), 'invalid-argument');
    await fails(call({ zoneId: '' }), 'invalid-argument');
    await fails(call({ reportId: undefined }), 'invalid-argument');
  });

  test('comment is limited to 500 characters', async () => {
    const reportId = await draft();
    await fails(saveZone(reportId, 'women-image', [], { storeComment: 'x'.repeat(501) }), 'invalid-argument');
    await saveZone(reportId, 'women-image', [], { storeComment: 'x'.repeat(500) });
    expect((await getZone(reportId, 'women-image')).versions[0].storeComment).toHaveLength(500);
  });

  test('not part of this campaign with no photos is not_in_campaign', async () => {
    const reportId = await draft();
    await saveZone(reportId, 'women-image', [], { notInCampaign: true, storeComment: 'No stock' });
    expect(await getZone(reportId, 'women-image')).toMatchObject({ state: 'not_in_campaign', versions: [{ storeComment: 'No stock' }] });
    expect((await getReport(reportId)).zoneSummary['women-image']).toEqual({ state: 'not_in_campaign', deadline: null });
  });

  test('not part of this campaign together with photos is invalid-argument', async () => {
    const reportId = await draft();
    const photo = await putPhoto(d.bucket, photoPath(reportId, 'women-image'));
    await fails(saveZone(reportId, 'women-image', [photo], { notInCampaign: true }), 'invalid-argument');
  });

  test('unknown report or zone is not-found', async () => {
    const reportId = await draft();
    await fails(saveZone('missing-report', 'women-image', []), 'not-found');
    await fails(saveZone(reportId, 'no-such-zone', []), 'not-found');
  });

  test('another store and reviewers get permission-denied', async () => {
    const reportId = await draft();
    const args = { reportId, zoneId: 'women-image', photos: [], storeComment: '', notInCampaign: true };
    await fails(updateDraftZone(otherStoreCaller, args, d), 'permission-denied');
    await fails(updateDraftZone(avmCz, args, d), 'permission-denied');
    await fails(updateDraftZone(director, args, d), 'permission-denied');
    expect(await getZone(reportId, 'women-image')).toMatchObject({ state: 'empty' });
  });
});

describe('sendReport', () => {
  test('fails while any zone is still empty', async () => {
    const reportId = await draft();
    await fillAllZones(reportId);
    await saveZone(reportId, 'window-window-2', []);
    await fails(sendReport(storeCaller, { reportId }, d), 'failed-precondition');
    expect((await getReport(reportId)).status).toBe('draft');
    expect(d.notifier.events).toEqual([]);
  });

  test('fails when every zone is not part of the campaign', async () => {
    const reportId = await draft();
    await fillAllZones(reportId, ZONE_IDS);
    await fails(sendReport(storeCaller, { reportId }, d), 'failed-precondition');
  });

  test('submits photo zones, keeps not_in_campaign zones, marks the report sent and notifies once', async () => {
    const reportId = await draft();
    const skipped = ['window-window-1', 'window-window-2'];
    await fillAllZones(reportId, skipped);

    await sendReport(storeCaller, { reportId }, d);

    const report = await getReport(reportId);
    expect(report).toMatchObject({ status: 'sent', sentAt: NOW });
    for (const zoneId of ZONE_IDS) {
      const expected = skipped.includes(zoneId) ? 'not_in_campaign' : 'submitted';
      expect((await getZone(reportId, zoneId)).state).toBe(expected);
      expect(report.zoneSummary[zoneId]).toEqual({ state: expected, deadline: null });
    }
    expect(d.notifier.events).toEqual([{
      kind: 'report_sent',
      report: { id: reportId, storeId: '850', storeCode: '850', storeName: 'Palladium Praha', country: 'CZ', campaignName: CAMPAIGN },
    }]);
  });

  test('sending twice is a failed-precondition and notifies only once', async () => {
    const reportId = await draft();
    await fillAllZones(reportId);
    await sendReport(storeCaller, { reportId }, d);
    await fails(sendReport(storeCaller, { reportId }, d), 'failed-precondition');
    expect(d.notifier.events).toHaveLength(1);
  });

  test('a notifier failure after the commit does not fail the send', async () => {
    const reportId = await draft();
    await fillAllZones(reportId);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = { ...d, notifier: { notify: () => Promise.reject(new Error('push down')) } };
    await sendReport(storeCaller, { reportId }, failing);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
    expect((await getReport(reportId)).status).toBe('sent');
  });

  test('another store and reviewers get permission-denied, an unknown report not-found', async () => {
    const reportId = await draft();
    await fillAllZones(reportId);
    await fails(sendReport(otherStoreCaller, { reportId }, d), 'permission-denied');
    await fails(sendReport(avmCz, { reportId }, d), 'permission-denied');
    await fails(sendReport(storeCaller, { reportId: 'missing' }, d), 'not-found');
    await fails(sendReport(storeCaller, {} as { reportId: string }, d), 'invalid-argument');
    expect((await getReport(reportId)).status).toBe('draft');
  });

  test('updateDraftZone after send is a failed-precondition', async () => {
    const reportId = await draft();
    await fillAllZones(reportId);
    await sendReport(storeCaller, { reportId }, d);
    await fails(saveZone(reportId, 'women-image', [], { notInCampaign: true }), 'failed-precondition');
    expect((await getZone(reportId, 'women-image')).state).toBe('submitted');
  });
});

describe('markSeen', () => {
  async function sentReport(): Promise<string> {
    const reportId = await draft();
    await fillAllZones(reportId);
    await sendReport(storeCaller, { reportId }, d);
    return reportId;
  }

  test('a reviewer of another country gets permission-denied', async () => {
    const reportId = await sentReport();
    await fails(markSeen(avmSk, { reportId }, d), 'permission-denied');
    expect((await getReport(reportId)).seenBy).toEqual([]);
  });

  test('head of VM, director and the country avm are recorded once each', async () => {
    const reportId = await sentReport();
    await markSeen(headVm, { reportId }, d);
    await markSeen(headVm, { reportId }, d);
    await markSeen(director, { reportId }, d);
    await markSeen(avmCz, { reportId }, d);
    expect((await getReport(reportId)).seenBy.sort()).toEqual([avmCz.uid, director.uid, headVm.uid].sort());
  });

  test('stores cannot mark a report as seen', async () => {
    const reportId = await sentReport();
    await fails(markSeen(storeCaller, { reportId }, d), 'permission-denied');
  });

  test('a draft report is a failed-precondition, an unknown one not-found', async () => {
    const reportId = await draft();
    await fails(markSeen(headVm, { reportId }, d), 'failed-precondition');
    await fails(markSeen(headVm, { reportId: 'missing' }, d), 'not-found');
    await fails(markSeen(headVm, {} as { reportId: string }, d), 'invalid-argument');
  });
});
