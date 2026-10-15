import { describe, expect, test } from 'vitest';
import {
  REMINDER_HOUR, addDays, dayBeforeAlreadyCovered, formatDayMonth, isOverdue, isValidDeadline,
  localDate, localHour, reminderDue,
} from '../src/dates';
import type { ZoneDoc } from '../src/types';

const PRAGUE = 'Europe/Prague';
const BUCHAREST = 'Europe/Bucharest';

// Prague is UTC+2 (CEST) on 15-17 Oct 2026; summer time ends on 25 Oct 2026.
// Helper: instant for a Prague wall-clock time on the given day in October 2026.
const prague = (day: number, hour: number, minute = 0) => Date.UTC(2026, 9, day, hour - 2, minute);

describe('localDate / localHour', () => {
  test('22:30 UTC on 15 Oct is already 16 Oct in Prague', () => {
    expect(localDate(Date.UTC(2026, 9, 15, 22, 30), PRAGUE)).toBe('2026-10-16');
  });
  test('21:59 UTC on 15 Oct is still 15 Oct in Prague', () => {
    expect(localDate(Date.UTC(2026, 9, 15, 21, 59), PRAGUE)).toBe('2026-10-15');
  });
  test('07:00 UTC is 09:00 in Prague', () => {
    expect(localHour(Date.UTC(2026, 9, 15, 7, 0), PRAGUE)).toBe(9);
  });
  test('local midnight is hour 0, not 24', () => {
    expect(localHour(Date.UTC(2026, 9, 15, 22, 0), PRAGUE)).toBe(0);
  });
  test('Bucharest is one hour ahead of Prague', () => {
    expect(localHour(Date.UTC(2026, 9, 15, 7, 0), BUCHAREST)).toBe(10);
    expect(localDate(Date.UTC(2026, 9, 15, 21, 30), BUCHAREST)).toBe('2026-10-16');
    expect(localDate(Date.UTC(2026, 9, 15, 21, 30), PRAGUE)).toBe('2026-10-15');
  });
  test('winter time: UTC+1 in Prague after 25 Oct', () => {
    expect(localHour(Date.UTC(2026, 10, 2, 8, 0), PRAGUE)).toBe(9);
  });
});

describe('addDays', () => {
  test('crosses a month boundary backwards (non-leap Feb)', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  test('leap day exists in 2028', () => {
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
  test('crosses a year boundary in both directions', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });
  test('adds more than a month', () => {
    expect(addDays('2026-10-15', 30)).toBe('2026-11-14');
  });
  test('zero is a no-op', () => {
    expect(addDays('2026-10-15', 0)).toBe('2026-10-15');
  });
});

describe('isValidDeadline', () => {
  const now = Date.UTC(2026, 9, 15, 8); // 15 Oct 10:00 in Prague
  test('yesterday is rejected', () => expect(isValidDeadline('2026-10-14', now, PRAGUE)).toBe(false));
  test('today is accepted', () => expect(isValidDeadline('2026-10-15', now, PRAGUE)).toBe(true));
  test('a later day is accepted', () => expect(isValidDeadline('2026-12-24', now, PRAGUE)).toBe(true));
  test('impossible date 2026-02-30 is rejected', () => expect(isValidDeadline('2026-02-30', now, PRAGUE)).toBe(false));
  test('29 Feb in a non-leap year is rejected', () => expect(isValidDeadline('2027-02-29', now, PRAGUE)).toBe(false));
  test('29 Feb in a leap year is accepted', () => expect(isValidDeadline('2028-02-29', now, PRAGUE)).toBe(true));
  test('month 13 is rejected', () => expect(isValidDeadline('2026-13-01', now, PRAGUE)).toBe(false));
  test('dotted format is rejected', () => expect(isValidDeadline('16.10.2026', now, PRAGUE)).toBe(false));
  test.each(['', '2026-1-5', '2026-10-15T00:00:00Z', ' 2026-10-15', '2026-10-15\n', '+2026-10-15'])(
    'malformed %j is rejected', (s) => expect(isValidDeadline(s, now, PRAGUE)).toBe(false));
  test('uses the store-local today, not UTC today', () => {
    // 22:30 UTC on 15 Oct is 00:30 on 16 Oct in Prague: the 15th is already past there.
    const lateUtc = Date.UTC(2026, 9, 15, 22, 30);
    expect(isValidDeadline('2026-10-15', lateUtc, PRAGUE)).toBe(false);
    expect(isValidDeadline('2026-10-16', lateUtc, PRAGUE)).toBe(true);
  });
});

describe('isOverdue', () => {
  test('on the deadline day, even late in the evening, is not overdue (22:00 Prague)', () => {
    expect(isOverdue('2026-10-15', Date.UTC(2026, 9, 15, 20), PRAGUE)).toBe(false);
  });
  test('the day after the deadline is overdue (22:00 Prague on 16 Oct)', () => {
    expect(isOverdue('2026-10-15', Date.UTC(2026, 9, 16, 20), PRAGUE)).toBe(true);
  });
  test('just after local midnight the deadline has passed (00:30 Prague on 16 Oct)', () => {
    expect(isOverdue('2026-10-15', Date.UTC(2026, 9, 15, 22, 30), PRAGUE)).toBe(true);
  });
  test('no deadline is never overdue', () => {
    expect(isOverdue(null, Date.UTC(2030, 0, 1), PRAGUE)).toBe(false);
  });
});

describe('formatDayMonth', () => {
  test('2026-10-16 -> 16.10', () => expect(formatDayMonth('2026-10-16')).toBe('16.10'));
  test('keeps leading zeros', () => expect(formatDayMonth('2026-01-05')).toBe('05.01'));
});

describe('reminders', () => {
  test('REMINDER_HOUR is 09:00', () => expect(REMINDER_HOUR).toBe(9));

  const zone = (over: Partial<Pick<ZoneDoc, 'state' | 'earliestOpenDeadline' | 'reminderDayBeforeSentFor' | 'reminderOverdueSentFor'>> = {}) => ({
    state: 'needs_correction' as const,
    earliestOpenDeadline: '2026-10-16' as string | null,
    reminderDayBeforeSentFor: null as string | null,
    reminderOverdueSentFor: null as string | null,
    ...over,
  });

  describe('deadline 2026-10-16, Prague', () => {
    test('08:30 local on 15 Oct (day before, too early) -> null', () => {
      expect(reminderDue(zone(), prague(15, 8, 30), PRAGUE)).toBeNull();
    });
    test('08:59 local on 15 Oct -> null, 09:00 local -> day_before', () => {
      expect(reminderDue(zone(), prague(15, 8, 59), PRAGUE)).toBeNull();
      expect(reminderDue(zone(), prague(15, 9, 0), PRAGUE)).toBe('day_before');
    });
    test('09:05 local on 15 Oct -> day_before', () => {
      expect(reminderDue(zone(), prague(15, 9, 5), PRAGUE)).toBe('day_before');
    });
    test('late evening local on 15 Oct (catch-up run) -> day_before', () => {
      expect(reminderDue(zone(), prague(15, 23, 30), PRAGUE)).toBe('day_before');
    });
    test('09:05 local on 15 Oct, day_before already sent for this deadline -> null', () => {
      expect(reminderDue(zone({ reminderDayBeforeSentFor: '2026-10-16' }), prague(15, 9, 5), PRAGUE)).toBeNull();
    });
    test('day_before sent for an older deadline does not block a new deadline', () => {
      expect(reminderDue(zone({ reminderDayBeforeSentFor: '2026-10-20' }), prague(15, 9, 5), PRAGUE)).toBe('day_before');
    });
    test('09:00 local on the deadline day itself -> null (neither day before nor overdue)', () => {
      expect(reminderDue(zone(), prague(16, 9, 0), PRAGUE)).toBeNull();
    });
    test('09:00 local on 17 Oct (day after) -> overdue', () => {
      expect(reminderDue(zone(), prague(17, 9, 0), PRAGUE)).toBe('overdue');
    });
    test('08:00 local on 17 Oct -> null (too early)', () => {
      expect(reminderDue(zone(), prague(17, 8, 0), PRAGUE)).toBeNull();
    });
    test('overdue already sent for this deadline -> null', () => {
      expect(reminderDue(zone({ reminderOverdueSentFor: '2026-10-16' }), prague(17, 9, 0), PRAGUE)).toBeNull();
    });
    test('overdue sent for an older deadline does not block this one', () => {
      expect(reminderDue(zone({ reminderOverdueSentFor: '2026-10-10' }), prague(17, 9, 0), PRAGUE)).toBe('overdue');
    });
    test('still overdue several days later -> overdue until it has been sent', () => {
      expect(reminderDue(zone(), prague(20, 15), PRAGUE)).toBe('overdue');
    });
    test('two days before -> null', () => {
      expect(reminderDue(zone(), prague(14, 12, 0), PRAGUE)).toBeNull();
    });
  });

  describe('state and deadline gates', () => {
    test.each(['empty', 'photo_added', 'not_in_campaign', 'submitted', 'correction_sent', 'approved'] as const)(
      'state %s -> null even when a deadline is overdue', (state) => {
        expect(reminderDue(zone({ state }), prague(17, 9, 0), PRAGUE)).toBeNull();
      });
    test('no deadline -> null', () => {
      expect(reminderDue(zone({ earliestOpenDeadline: null }), prague(17, 9, 0), PRAGUE)).toBeNull();
    });
  });

  describe('time zone handling', () => {
    test('the hour gate uses the store time zone: 07:00 UTC is 09:00 Prague but 10:00 Bucharest', () => {
      const at = Date.UTC(2026, 9, 15, 6, 30); // 08:30 Prague, 09:30 Bucharest
      expect(reminderDue(zone(), at, PRAGUE)).toBeNull();
      expect(reminderDue(zone(), at, BUCHAREST)).toBe('day_before');
    });
    test('the date uses the store time zone: 22:30 UTC on 15 Oct is 16 Oct local, the deadline day', () => {
      expect(reminderDue(zone(), Date.UTC(2026, 9, 15, 22, 30), PRAGUE)).toBeNull();
    });
  });

  describe('deadline on the first of a month', () => {
    test('day before is the last day of the previous month', () => {
      const z = zone({ earliestOpenDeadline: '2026-11-01' });
      expect(reminderDue(z, Date.UTC(2026, 9, 31, 12), PRAGUE)).toBe('day_before');
    });
  });

  describe('a new earlier deadline re-arms both reminders', () => {
    test('flags keyed to the old deadline do not suppress the new one', () => {
      const z = zone({
        earliestOpenDeadline: '2026-10-16',
        reminderDayBeforeSentFor: '2026-10-25',
        reminderOverdueSentFor: '2026-10-25',
      });
      expect(reminderDue(z, prague(15, 9, 5), PRAGUE)).toBe('day_before');
      expect(reminderDue(z, prague(17, 9, 5), PRAGUE)).toBe('overdue');
    });
  });
});

describe('dayBeforeAlreadyCovered', () => {
  test('15 Oct 15:00 local for deadline 16 Oct -> true', () => {
    expect(dayBeforeAlreadyCovered('2026-10-16', prague(15, 15), PRAGUE)).toBe(true);
  });
  test('on the deadline day -> true', () => {
    expect(dayBeforeAlreadyCovered('2026-10-16', prague(16, 8), PRAGUE)).toBe(true);
  });
  test('14 Oct for deadline 16 Oct -> false', () => {
    expect(dayBeforeAlreadyCovered('2026-10-16', prague(14, 12), PRAGUE)).toBe(false);
  });
  test('uses store-local date: 22:30 UTC on 14 Oct is already 15 Oct in Prague -> true', () => {
    expect(dayBeforeAlreadyCovered('2026-10-16', Date.UTC(2026, 9, 14, 22, 30), PRAGUE)).toBe(true);
  });
});
