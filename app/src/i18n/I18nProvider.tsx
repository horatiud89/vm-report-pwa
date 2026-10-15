import { doc, updateDoc } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { LANGS, t as translate } from '@shared/i18n';
import type { MsgKey } from '@shared/i18n';
import type { Lang } from '@shared/types';
import { useSession } from '../auth/AuthProvider';
import { db } from '../firebase';

export interface I18n {
  lang: Lang;
  t: (key: MsgKey, params?: Record<string, string | number>) => string;
  setLang: (lang: Lang) => Promise<void>;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useSession();
  const stored = profile?.language;
  const lang: Lang = stored && LANGS.includes(stored) ? stored : 'en';
  const uid = user?.uid;

  // The profile snapshot follows this write immediately, so the whole UI switches at once.
  const setLang = useCallback(async (next: Lang) => {
    if (!uid) throw new Error('Not signed in');
    await updateDoc(doc(db, 'users', uid), { language: next });
  }, [uid]);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const value = useMemo<I18n>(() => ({ lang, t: (key, params) => translate(lang, key, params), setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useT must be used inside I18nProvider');
  return value;
}
