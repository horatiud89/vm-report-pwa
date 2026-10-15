import { useSyncExternalStore } from 'react';
import { useT } from '../i18n/I18nProvider';

/** Chrome's install prompt event (not in the DOM typings). */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

// Chrome fires beforeinstallprompt once, early (often before sign-in has finished), so it is caught as soon
// as the app loads and kept for the Install app button until it is used or the app gets installed.
let caughtPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function setCaughtPrompt(next: InstallPromptEvent | null) {
  caughtPrompt = next;
  for (const listener of listeners) listener();
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); // our Install app button instead of Chrome's own mini-infobar
  setCaughtPrompt(event as InstallPromptEvent);
});
window.addEventListener('appinstalled', () => setCaughtPrompt(null));

/** Android Chrome's install prompt, or null while there is none (or it was used). */
export function useInstallPrompt(): InstallPromptEvent | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    () => caughtPrompt,
  );
}

/** Android: installs the app through Chrome's prompt, which can be shown only once. */
export function InstallButton({ prompt }: { prompt: InstallPromptEvent }) {
  const { t } = useT();
  function install() {
    setCaughtPrompt(null);
    void prompt.prompt().catch(() => { /* already used or dismissed: nothing to do */ });
  }
  return (
    <div className="banner-action">
      <button type="button" className="btn btn-primary" onClick={install}>{t('install.android')}</button>
    </div>
  );
}

/** iPhone/iPad in Safari: push only reaches the Home Screen app (iOS 16.4+), so show how to add it there. */
export function InstallGuide() {
  const { t } = useT();
  return (
    <section className="banner" aria-labelledby="install-guide-title">
      <h2 id="install-guide-title" className="banner-title">{t('install.iosTitle')}</h2>
      <ol className="banner-steps">
        <li>{t('install.iosStep1')}<ShareIcon /></li>
        <li>{t('install.iosStep2')}</li>
        <li>{t('install.iosStep3')}</li>
      </ol>
    </section>
  );
}

/** The iOS Share symbol (box with an arrow up), so step 1 is easy to match on screen. */
function ShareIcon() {
  return (
    <svg className="share-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 10H6v11h12V10h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
