import type { Lang, ZoneState } from '../types';
import { cs } from './cs';
import { en } from './en';
import type { Dict, MsgKey } from './en';
import { ro } from './ro';
import { sk } from './sk';

export { en };
export type { Dict, MsgKey };

export const LANGS: Lang[] = ['en', 'cs', 'sk', 'ro'];

export const LANG_NAME: Record<Lang, string> = {
  en: 'English',
  cs: 'Čeština',
  sk: 'Slovenčina',
  ro: 'Română',
};

const DICTS: Record<Lang, Dict> = { en, cs, sk, ro };

/**
 * Text for `key` in `lang`, with every `{name}` replaced by `params.name`.
 * Placeholders without a param stay as they are. An unknown language (e.g. a bad
 * `language` field read from Firestore) or a missing text falls back to English.
 */
export function t(lang: Lang, key: MsgKey, params?: Record<string, string | number>): string {
  const dict: Dict | undefined = DICTS[lang];
  const template = dict?.[key] || en[key];
  if (!params) return template;
  // A replacer function inserts values literally: campaign names may contain "$&".
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder);
}

export function stateLabel(lang: Lang, s: ZoneState | 'overdue'): string {
  return t(lang, `state.${s}`);
}
