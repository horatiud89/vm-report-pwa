import { LANGS, LANG_NAME } from '@shared/i18n';
import type { Lang } from '@shared/types';
import { useSession } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import { useToast } from './Toast';

export function SettingsPage() {
  const { lang, t, setLang } = useT();
  const { logout } = useSession();
  const toast = useToast();

  async function choose(next: Lang) {
    try {
      await setLang(next);
    } catch {
      toast(t('error.generic'));
    }
  }

  return (
    <>
      <h1>{t('nav.settings')}</h1>
      <fieldset className="choice-list">
        <legend>{t('settings.language')}</legend>
        {LANGS.map((code) => (
          <label key={code} className="choice">
            <input type="radio" name="language" value={code} checked={lang === code} onChange={() => void choose(code)} />
            <span>{LANG_NAME[code]}</span>
          </label>
        ))}
      </fieldset>
      <button type="button" className="btn" onClick={() => void logout()}>{t('settings.logout')}</button>
    </>
  );
}
