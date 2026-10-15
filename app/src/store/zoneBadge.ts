import { isOverdue } from '@shared/dates';
import type { ReportDoc, ZoneDoc, ZoneState } from '@shared/types';

/** The state shown for a zone in this state with this deadline: a correction past its deadline (in the time zone) reads Overdue. */
export function shownState(state: ZoneState, deadline: string | null, timezone: string, now: number): ZoneState | 'overdue' {
  return state === 'needs_correction' && isOverdue(deadline, now, timezone) ? 'overdue' : state;
}

/** The state shown for a zone: a correction past its deadline reads Overdue. */
export function badgeState(zone: ZoneDoc, report: ReportDoc, now: number): ZoneDoc['state'] | 'overdue' {
  return shownState(zone.state, zone.earliestOpenDeadline, report.timezone, now);
}
