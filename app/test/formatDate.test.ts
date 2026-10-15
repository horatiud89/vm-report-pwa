import { describe, expect, test } from 'vitest';
import { formatDate } from '../src/i18n/formatDate';

describe('formatDate', () => {
  const ms = Date.UTC(2026, 9, 15, 10);

  test('writes the day, short month and year in the language', () => {
    expect(formatDate('en', ms, 'Europe/Prague')).toBe('15 Oct 2026');
    expect(formatDate('cs', ms, 'Europe/Prague')).toContain('15');
    expect(formatDate('ro', ms, 'Europe/Bucharest')).toContain('2026');
  });

  test('uses the calendar day of the time zone, not of UTC', () => {
    const lateEvening = Date.UTC(2026, 9, 15, 23, 30); // already 16 Oct in Prague
    expect(formatDate('en', lateEvening, 'Europe/Prague')).toBe('16 Oct 2026');
    expect(formatDate('en', lateEvening, 'UTC')).toBe('15 Oct 2026');
  });
});
