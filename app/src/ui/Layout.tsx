import { NavLink, Link, Outlet } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';

export const APP_TITLE = 'VM Photo Report';

/** Header with the main navigation, then the routed screen. Used by every signed-in route. */
export function Layout() {
  const { t } = useT();
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
        <Outlet />
      </main>
    </>
  );
}
