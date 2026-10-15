import { error as logError } from 'firebase-functions/logger';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ZoneDoc } from '@shared/types';
import type { Deps } from '../src/deps';
import { runReminders } from '../src/reminders';
import { giveFeedback, sendCorrection } from '../src/review';
import { avmCz, createSentReport, photoPath, putPhoto, resetData, seedStore850, storeCaller, testDeps } from './helpers';

vi.mock('firebase-functions/logger');

const d = testDeps();
const ZONE = 'women-image';
const OTHER_ZONE = 'women-wall-1';
const DEADLINE = '2026-10-16';

/** Prague is UTC+2 on these dates (summer time until 2026-10-25). */
const prague = (day: number, hour: number, minute: number) => Date.UTC(2026, 9, day, hour - 2, minute);
/** By default feedback is given well before the day-before window, so the day-before reminder is still pending. */
const EARLY = prague(10, 12, 0);

const getZone = async (reportId: string, zoneId = ZONE) => (await d.db.doc(`reports/${reportId}/zones/${zoneId}`).get()).data() as ZoneDoc;
const kinds = () => d.notifier.events.map((e) => e.kind);

/** A sent report in which the reviewer asked for a correction of the zone, due on `deadline`. */
async function reportWithFeedback(opts: { zoneId?: string; reportId?: string; givenAt?: number } = {}): Promise<string> {
  const { zoneId = ZONE, givenAt = EARLY } = opts;
  const reportId = opts.reportId ?? await createSentReport(d);
  await giveFeedback(avmCz, {
    reportId, zoneId, version: 1, photoIndex: 0, comment: 'Straighten the shirts', strokes: [], deadline: DEADLINE,
  }, { ...d, now: () => givenAt });
  d.notifier.events.length = 0;   // the fixture's events are not under test
  return reportId;
}

/** Runs the hourly job at the given moment. */
const runAt = (now: number, deps: Deps = d) => runReminders({ ...deps, now: () => now });

/** The test deps with every db.doc(path) recorded, to see how often a report is read. */
function countingDeps() {
  const docPaths: string[] = [];
  const db = new Proxy(d.db, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target);
      if (prop === 'doc') return (path: string) => { docPaths.push(path); return target.doc(path); };
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { deps: { ...d, db } as Deps, docPaths };
}

beforeEach(async () => {
  vi.mocked(logError).mockClear();
  await resetData(d);
  await seedStore850(d.db);
  d.notifier.events.length = 0;
});

describe('runReminders', () => {
  test('sends the day-before reminder at 09:00 store time on the day before the deadline, once', async () => {
    const reportId = await reportWithFeedback();

    expect(await runAt(prague(15, 9, 10))).toBe(1);
    expect(d.notifier.events).toEqual([{
      kind: 'reminder_day_before',
      report: { id: reportId, storeId: '850', storeCode: '850', storeName: 'Palladium Praha', country: 'CZ', campaignName: 'Autumn 2026' },
      zoneId: ZONE, zoneName: "Women's Image", deadline: DEADLINE,
    }]);
    expect(await getZone(reportId)).toMatchObject({ reminderDayBeforeSentFor: DEADLINE, reminderOverdueSentFor: null });

    expect(await runAt(prague(15, 10, 10))).toBe(0);
    expect(d.notifier.events).toHaveLength(1);
  });

  test('sends the overdue reminder the day after the deadline, after the day-before one, once each', async () => {
    const reportId = await reportWithFeedback();
    await runAt(prague(15, 9, 10));

    expect(await runAt(prague(16, 9, 10))).toBe(0);   // the deadline day itself has no reminder
    expect(await runAt(prague(17, 9, 10))).toBe(1);
    expect(kinds()).toEqual(['reminder_day_before', 'reminder_overdue']);
    expect(d.notifier.events[1]).toMatchObject({ zoneId: ZONE, deadline: DEADLINE });
    expect(await getZone(reportId)).toMatchObject({ reminderDayBeforeSentFor: DEADLINE, reminderOverdueSentFor: DEADLINE });

    expect(await runAt(prague(18, 9, 10))).toBe(0);
    expect(d.notifier.events).toHaveLength(2);
  });

  test('sends only the overdue reminder when the day before was missed', async () => {
    const reportId = await reportWithFeedback();

    expect(await runAt(prague(17, 9, 10))).toBe(1);
    expect(kinds()).toEqual(['reminder_overdue']);
    expect(await getZone(reportId)).toMatchObject({ reminderDayBeforeSentFor: null, reminderOverdueSentFor: DEADLINE });
  });

  test('waits for 09:00 in the store time zone, not UTC or the server', async () => {
    const reportId = await reportWithFeedback();
    expect(await runAt(prague(15, 8, 59))).toBe(0);
    expect(await getZone(reportId)).toMatchObject({ reminderDayBeforeSentFor: null });

    // 08:10 in Prague is 09:10 in Bucharest: the report's own time zone decides.
    await d.db.doc(`reports/${reportId}`).update({ timezone: 'Europe/Bucharest' });
    expect(await runAt(prague(15, 8, 10))).toBe(1);
  });

  test('a zone that already got its correction gets no reminder', async () => {
    const reportId = await reportWithFeedback();
    const photos = [await putPhoto(d.bucket, photoPath(reportId, ZONE, 'fix.jpg'))];
    await sendCorrection(storeCaller, { reportId, zoneId: ZONE, photos, storeComment: 'Done' }, d);
    d.notifier.events.length = 0;

    expect(await runAt(prague(15, 9, 10))).toBe(0);
    expect(await runAt(prague(17, 9, 10))).toBe(0);
    expect(d.notifier.events).toHaveLength(0);
  });

  test('a deadline given inside its day-before window gets only the overdue reminder: the feedback itself was the notice', async () => {
    const reportId = await reportWithFeedback({ givenAt: prague(15, 7, 0) });

    expect(await runAt(prague(15, 9, 10))).toBe(0);
    expect(await runAt(prague(17, 9, 10))).toBe(1);
    expect(kinds()).toEqual(['reminder_overdue']);
    expect(await getZone(reportId)).toMatchObject({ reminderDayBeforeSentFor: DEADLINE, reminderOverdueSentFor: DEADLINE });
  });

  test('handles several zones and reports in one run and reads each report once', async () => {
    const first = await reportWithFeedback();
    await reportWithFeedback({ reportId: first, zoneId: OTHER_ZONE });
    const second = await reportWithFeedback();

    const { deps, docPaths } = countingDeps();
    expect(await runAt(prague(15, 9, 10), deps)).toBe(3);

    expect(d.notifier.events.map((e) => `${e.report.id}/${'zoneId' in e ? e.zoneId : ''}`).sort())
      .toEqual([`${first}/${OTHER_ZONE}`, `${first}/${ZONE}`, `${second}/${ZONE}`].sort());
    expect(docPaths.filter((path) => path.startsWith('reports/') && !path.includes('/zones/')).sort())
      .toEqual([`reports/${first}`, `reports/${second}`].sort());
  });

  test('a zone that cannot be processed does not stop the others', async () => {
    const broken = await reportWithFeedback();
    const fine = await reportWithFeedback();
    await d.db.doc(`reports/${broken}`).update({ timezone: 'Not/AZone' });

    expect(await runAt(prague(15, 9, 10))).toBe(1);
    expect(d.notifier.events).toHaveLength(1);
    expect(d.notifier.events[0]).toMatchObject({ report: { id: fine } });
    expect((await getZone(broken)).reminderDayBeforeSentFor).toBeNull();
    expect(logError).toHaveBeenCalledOnce();
  });

  test('zones that are not waiting for a correction are ignored', async () => {
    await createSentReport(d);
    d.notifier.events.length = 0;   // the fixture's report_sent event is not under test
    expect(await runAt(prague(17, 9, 10))).toBe(0);
    expect(d.notifier.events).toHaveLength(0);
  });
});
