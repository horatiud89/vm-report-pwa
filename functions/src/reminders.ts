import * as logger from 'firebase-functions/logger';
import { reminderDue } from '@shared/dates';
import type { ReportDoc, ZoneDoc } from '@shared/types';
import { toRef } from './common';
import type { Deps } from './deps';

/**
 * The hourly job: every zone still waiting for a correction whose reminder is due gets one push to its store,
 * then the zone remembers which deadline it reminded about so the next run stays quiet. Returns how many were sent.
 */
export async function runReminders(d: Deps): Promise<number> {
  const now = d.now();
  const zones = await d.db.collectionGroup('zones').where('state', '==', 'needs_correction').get();

  // Many zones share a report; read each report once per run.
  const reports = new Map<string, Promise<ReportDoc | undefined>>();
  const reportOf = (id: string) => {
    let report = reports.get(id);
    if (!report) {
      report = d.db.doc(`reports/${id}`).get().then((snap) => snap.data() as ReportDoc | undefined);
      reports.set(id, report);
    }
    return report;
  };

  let sent = 0;
  for (const snap of zones.docs) {
    const zone = snap.data() as ZoneDoc;
    try {
      const report = await reportOf(zone.reportId);
      const due = report && reminderDue(zone, now, report.timezone);
      const deadline = zone.earliestOpenDeadline;
      if (!report || !due || deadline === null) continue;

      await d.notifier.notify({
        kind: due === 'day_before' ? 'reminder_day_before' : 'reminder_overdue',
        report: toRef(report), zoneId: zone.id, zoneName: zone.name, deadline,
      });
      await snap.ref.update({ [due === 'day_before' ? 'reminderDayBeforeSentFor' : 'reminderOverdueSentFor']: deadline });
      sent++;
    } catch (err) {
      // One bad zone (say a report with a broken time zone) must not silence everyone else's reminders every hour.
      logger.error(`reminder for ${snap.ref.path} failed`, err);
    }
  }
  return sent;
}
