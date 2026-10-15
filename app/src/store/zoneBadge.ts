import { isOverdue } from '@shared/dates';
import type { ReportDoc, ZoneDoc } from '@shared/types';

/** The state shown for a zone: a correction past its deadline reads Overdue. */
export function badgeState(zone: ZoneDoc, report: ReportDoc, now: number): ZoneDoc['state'] | 'overdue' {
  return zone.state === 'needs_correction' && isOverdue(zone.earliestOpenDeadline, now, report.timezone) ? 'overdue' : zone.state;
}
