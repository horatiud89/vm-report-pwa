import type { Lang } from '@shared/types';

const DATE_LOCALE: Record<Lang, string> = { en: 'en-GB', cs: 'cs-CZ', sk: 'sk-SK', ro: 'ro-RO' };

/** "15 Oct 2026" in the user's language, as the calendar day it was in the given time zone. */
export function formatDate(lang: Lang, ms: number, timezone: string): string {
  return new Date(ms).toLocaleDateString(DATE_LOCALE[lang], { timeZone: timezone, day: 'numeric', month: 'short', year: 'numeric' });
}
