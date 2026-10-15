import { Navigate, Route, Routes } from 'react-router-dom';
import { ROLE_LABEL } from '@shared/access';
import { useSession } from './auth/AuthProvider';
import { LoginPage } from './auth/LoginPage';
import { ResetPage } from './auth/ResetPage';
import { useT } from './i18n/I18nProvider';
import { APP_TITLE, Layout } from './ui/Layout';
import { Loading } from './ui/Loading';
import { SettingsPage } from './ui/SettingsPage';

/**
 * Signed-in routes only: login when signed out; "no access" only when the token was read and has no role;
 * a retry prompt when the token could not be read at all (offline), which says nothing about access.
 */
function RequireAccess() {
  const { user, claims, claimsError, retryClaims, loading, logout } = useSession();
  const { t } = useT();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (claimsError) {
    return (
      <main className="content">
        <h1>{APP_TITLE}</h1>
        <p role="alert">{t('error.generic')}</p>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={retryClaims}>{t('common.retry')}</button>
          <button type="button" className="btn" onClick={() => void logout()}>{t('settings.logout')}</button>
        </div>
      </main>
    );
  }
  if (!claims) {
    return (
      <main className="content">
        <h1>{APP_TITLE}</h1>
        <p>{t('error.noAccess')}</p>
        <button type="button" className="btn" onClick={() => void logout()}>{t('settings.logout')}</button>
      </main>
    );
  }
  return <Layout />;
}

/** Login is for signed-out users; a session (even one without access) goes on to the app. */
function LoginRoute() {
  const { user, loading } = useSession();
  if (loading) return <Loading />;
  return user ? <Navigate to="/" replace /> : <LoginPage />;
}

/** Placeholder until the store and reviewer home screens replace it. */
function HomeShell() {
  const { claims } = useSession();
  if (!claims) return null;
  return (
    <>
      <h1>{APP_TITLE}</h1>
      <p>{claims.storeId ? `${ROLE_LABEL[claims.role]} · ${claims.storeId}` : ROLE_LABEL[claims.role]}</p>
    </>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/reset" element={<ResetPage />} />
      <Route element={<RequireAccess />}>
        <Route path="/" element={<HomeShell />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
