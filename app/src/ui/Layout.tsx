import { useEffect, useEffectEvent, useState } from 'react';
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { useSession } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import { InstallButton, InstallGuide, useInstallPrompt } from '../push/InstallGuide';
import { linkPath } from '../push/link';
import { NotificationsButton } from '../push/NotificationsButton';
import { currentPlatform, currentPushSupported } from '../push/platform';
import { onForegroundMessage, refreshPush } from '../push/push';
import type { ForegroundMessage } from '../push/push';
import { useToast } from './Toast';

export const APP_TITLE = 'VM Photo Report';

/** Header with the main navigation, the device banner, then the routed screen. Used by every signed-in route. */
export function Layout() {
  const { t } = useT();
  const { user } = useSession();
  return (
    <>
      <header className="app-header">
        <div className="content app-header-row">
          <Link to="/" className="app-title">{APP_TITLE}</Link>
          <nav aria-label={APP_TITLE} className="app-nav">
            <NavLink to="/" end>{t('nav.home')}</NavLink>
            <NavLink to="/settings">{t('nav.settings')}</NavLink>
          </nav>
        </div>
      </header>
      <main className="content">
        {user && <DeviceBanner uid={user.uid} />}
        <Outlet />
      </main>
    </>
  );
}

/**
 * At most one prompt above the screen, first match wins: Safari on iPhone/iPad → how to add the app to the
 * Home Screen (only that app gets push); Android with Chrome's install prompt → Install app; push possible
 * but not asked yet → Turn on notifications (after "no", nothing: the user chose). Once allowed, the token
 * is quietly re-registered, and pushes that arrive while the app is open show as a toast.
 */
function DeviceBanner({ uid }: { uid: string }) {
  const [device] = useState(() => ({ platform: currentPlatform(), pushSupported: currentPushSupported() }));
  const permission = device.pushSupported ? Notification.permission : null; // null: no push here at all
  const installPrompt = useInstallPrompt();
  useForegroundToasts(device.pushSupported);

  useEffect(() => {
    if (permission === 'granted') refreshPush(uid);
  }, [permission, uid]);

  if (device.platform === 'ios-browser') return <InstallGuide />;
  if (device.platform === 'android' && installPrompt) return <InstallButton prompt={installPrompt} />;
  if (permission === 'default') return <NotificationsButton uid={uid} />;
  return null;
}

/** A push that arrives while the app is open: its text as a toast, with Open going to its screen in the app. */
function useForegroundToasts(enabled: boolean) {
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const show = useEffectEvent(({ body, link }: ForegroundMessage) => {
    const path = linkPath(link);
    toast(body, path ? { label: t('common.open'), onClick: () => navigate(path) } : undefined);
  });
  useEffect(() => (enabled ? onForegroundMessage((message) => show(message)) : undefined), [enabled]);
}
