import type { ZoneDoc } from './types';

export const REMINDER_HOUR = 9;

export type ReminderKind = 'day_before' | 'overdue';

const DEADLINE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    // h23: midnight is 0, never 24.
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    });
    formatters.set(tz, f);
  }
  return f;
}

function localPart(nowMs: number, tz: string, type: 'year' | 'month' | 'day' | 'hour'): string {
  const part = formatterFor(tz).formatToParts(nowMs).find((p) => p.type === type);
  if (!part) throw new Error(`Intl returned no ${type} for time zone ${tz}`);
  return part.value;
}

/** Calendar date ('YYYY-MM-DD') at the given instant in the given IANA time zone. */
export function localDate(nowMs: number, tz: string): string {
  return `${localPart(nowMs, tz, 'year')}-${localPart(nowMs, tz, 'month')}-${localPart(nowMs, tz, 'day')}`;
}

/** Hour of day, 0-23, at the given instant in the given IANA time zone. */
export function localHour(nowMs: number, tz: string): number {
  return Number(localPart(nowMs, tz, 'hour'));
}

/** UTC midnight of a 'YYYY-MM-DD' date as epoch ms; setUTCFullYear avoids Date.UTC's 0-99 -> 1900s mapping. */
function utcMidnight(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(0).setUTCFullYear(y, m - 1, d);
}

/** Calendar arithmetic on a 'YYYY-MM-DD' date, done in UTC so no local time zone or DST can shift it. */
export function addDays(date: string, days: number): string {
  return new Date(utcMidnight(date) + days * 86_400_000).toISOString().slice(0, 10);
}

function isRealDate(date: string): boolean {
  if (!DEADLINE_FORMAT.test(date)) return false;
  // Impossible dates (2026-02-30) roll over into another month, so the round trip changes the string.
  return addDays(date, 0) === date;
}

/** A deadline is a real calendar date, not before the store's local today. */
export function isValidDeadline(deadline: string, nowMs: number, tz: string): boolean {
  return isRealDate(deadline) && deadline >= localDate(nowMs, tz);
}

export function isOverdue(deadline: string | null, nowMs: number, tz: string): boolean {
  return deadline !== null && localDate(nowMs, tz) > deadline;
}

/** '2026-10-16' -> '16.10' */
export function formatDayMonth(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}.${month}`;
}

/**
 * Which reminder, if any, an hourly job should send for this zone now. Flags are keyed by deadline,
 * so a new, earlier deadline re-arms both reminders.
 */
export function reminderDue(
  z: Pick<ZoneDoc, 'state' | 'earliestOpenDeadline' | 'reminderDayBeforeSentFor' | 'reminderOverdueSentFor'>,
  nowMs: number,
  tz: string,
): ReminderKind | null {
  const deadline = z.earliestOpenDeadline;
  if (z.state !== 'needs_correction' || deadline === null) return null;
  if (localHour(nowMs, tz) < REMINDER_HOUR) return null;
  const today = localDate(nowMs, tz);
  if (today > deadline && z.reminderOverdueSentFor !== deadline) return 'overdue';
  if (today === addDays(deadline, -1) && z.reminderDayBeforeSentFor !== deadline) return 'day_before';
  return null;
}

/** True when the day-before reminder moment has already passed, so a fresh deadline needs no separate reminder. */
export function dayBeforeAlreadyCovered(deadline: string, nowMs: number, tz: string): boolean {
  return localDate(nowMs, tz) >= addDays(deadline, -1);
}
