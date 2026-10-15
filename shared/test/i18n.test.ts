import { describe, expect, test } from 'vitest';
import { LANGS, LANG_NAME, en, stateLabel, t } from '../src/i18n';
import type { Dict, MsgKey } from '../src/i18n';
import { cs } from '../src/i18n/cs';
import { ro } from '../src/i18n/ro';
import { sk } from '../src/i18n/sk';
import type { Lang, ZoneState } from '../src/types';

const DICTS: Record<Lang, Dict> = { en, cs, sk, ro };
const KEYS = (Object.keys(en) as MsgKey[]).sort();
const STATUSES = Object.keys({
  empty: true, photo_added: true, not_in_campaign: true, submitted: true,
  needs_correction: true, overdue: true, correction_sent: true, approved: true,
} satisfies Record<ZoneState | 'overdue', true>) as (ZoneState | 'overdue')[];

const placeholders = (s: string): string[] => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort();
const roText = Object.values(ro).join('\n');

describe.each(Object.entries(DICTS))('%s dictionary', (_lang, dict) => {
  test('has exactly the keys of en', () => {
    expect(Object.keys(dict).sort()).toEqual(KEYS);
  });

  test('has no empty strings', () => {
    expect(KEYS.filter((key) => !dict[key]?.trim())).toEqual([]);
  });

  test('uses the same {placeholders} as en in every string', () => {
    const mismatched = KEYS.filter((key) => placeholders(dict[key]).join() !== placeholders(en[key]).join());
    expect(mismatched).toEqual([]);
  });
});

describe('languages', () => {
  test('LANGS lists en first, then cs, sk, ro', () => {
    expect(LANGS).toEqual(['en', 'cs', 'sk', 'ro']);
  });

  test('LANG_NAME gives each language its own name', () => {
    expect(LANG_NAME).toEqual({ en: 'English', cs: 'Čeština', sk: 'Slovenčina', ro: 'Română' });
  });
});

describe('t', () => {
  test('fills the push.feedback params in Romanian', () => {
    const text = t('ro', 'push.feedback', { zone: "Women's Wall 1", date: '16.10' });
    expect(text).toContain("Women's Wall 1");
    expect(text).toContain('16.10');
  });

  test('cs nav.home is translated', () => {
    expect(t('cs', 'nav.home')).not.toBe(t('en', 'nav.home'));
  });

  test('replaces every placeholder, numbers included', () => {
    expect(t('en', 'push.allApproved', { campaign: 'Autumn 2026', n: 12 })).toBe('Autumn 2026: zones approved (12)');
    expect(t('en', 'store.addPhoto', { n: 2 })).toBe('Add photo (2/3)');
  });

  test('English counts read right for one as well as for many (no "1 zones")', () => {
    expect(t('en', 'push.allApproved', { campaign: 'Autumn 2026', n: 1 })).toBe('Autumn 2026: zones approved (1)');
    // Every {n} sits after a colon, in brackets or in "Photo/Version {n}", never before a plural noun.
    const beforePlural = (Object.keys(en) as MsgKey[]).filter((key) => /\{n\} \w+s\b/.test(en[key]));
    expect(beforePlural).toEqual([]);
  });

  test('inserts param values literally, even with $ patterns', () => {
    expect(t('en', 'push.reportSent', { store: '850 Palladium Praha', campaign: 'Sale $& $1 $$' }))
      .toBe('850 Palladium Praha sent a report: Sale $& $1 $$');
  });

  test('leaves placeholders without a param as they are', () => {
    expect(t('en', 'push.reportSent', { store: '850 Palladium Praha' })).toBe('850 Palladium Praha sent a report: {campaign}');
    expect(t('en', 'common.deadline')).toBe('Deadline {date}');
  });

  test('falls back to English for a language it has no dictionary for', () => {
    expect(t('de' as Lang, 'nav.home')).toBe('Reports');
    expect(t('de' as Lang, 'common.deadline', { date: '16.10' })).toBe('Deadline 16.10');
  });
});

describe('stateLabel', () => {
  test('uses the English status labels', () => {
    expect(stateLabel('en', 'needs_correction')).toBe('Needs correction');
    expect(stateLabel('en', 'overdue')).toBe('Overdue');
  });

  test.each(LANGS)('%s: maps every status, overdue included, to its state.* text', (lang) => {
    for (const s of STATUSES) expect(stateLabel(lang, s), s).toBe(DICTS[lang][`state.${s}`]);
  });

  test.each(LANGS)('%s: gives every status a different label', (lang) => {
    const labels = STATUSES.map((s) => stateLabel(lang, s));
    expect(new Set(labels).size).toBe(STATUSES.length);
  });
});

describe('wording', () => {
  test.each(LANGS)('%s: Undo on the drawing is not the same word as Back', (lang) => {
    expect(t(lang, 'review.undo')).not.toBe(t(lang, 'common.back'));
  });

  test('an answered feedback reads as corrected (awaiting approval), not as resolved', () => {
    expect({ cs: cs['review.statusAnswered'], sk: sk['review.statusAnswered'], ro: ro['review.statusAnswered'] })
      .toEqual({ cs: 'Opraveno', sk: 'Opravené', ro: 'Corectat' });
  });
});

describe('Romanian', () => {
  test('uses comma-below ș/ț (U+0219/U+021B), never the cedilla forms (U+015E/F, U+0162/3)', () => {
    expect(roText).toMatch(/[șț]/u);
    expect(roText).not.toMatch(/[\u015E\u015F\u0162\u0163]/u);
  });

  test('follows the glossary: no "stivă", no "manechine"', () => {
    expect(roText).not.toMatch(/stivă/iu);
    expect(roText).not.toMatch(/manechine/iu);
  });
});
