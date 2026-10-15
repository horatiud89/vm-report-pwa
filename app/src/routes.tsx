import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { isReviewer } from '@shared/access';
import { useSession } from './auth/AuthProvider';
import { LoginPage } from './auth/LoginPage';
import { ResetPage } from './auth/ResetPage';
import { useReport } from './data/hooks';
import { useT } from './i18n/I18nProvider';
import { OverviewPage } from './review/OverviewPage';
import { ReviewHome } from './review/ReviewHome';
import { ReviewReportPage } from './review/ReviewReportPage';
import { ReviewZonePage } from './review/ReviewZonePage';
import { CorrectionPage } from './store/CorrectionPage';
import { DraftReportPage } from './store/DraftReportPage';
import { DraftZonePage } from './store/DraftZonePage';
import { NewReportPage } from './store/NewReportPage';
import { StoreHome } from './store/StoreHome';
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

/** The store's own reports, drafts and zones; reviewers have screens of their own and are sent home. */
function StoreOnly({ children }: { children: ReactElement }) {
  const { claims } = useSession();
  return claims?.role === 'store' ? children : <Navigate to="/" replace />;
}

/** The overview of all stores is for reviewers; a store user is sent home. */
function ReviewerOnly({ children }: { children: ReactElement }) {
  const { claims } = useSession();
  return claims && isReviewer(claims.role) ? children : <Navigate to="/" replace />;
}

/** The store's own screen for a path, or the reviewer's: the same addresses serve both. */
function ByRole({ store, reviewer }: { store: ReactElement; reviewer: ReactElement }) {
  const { claims } = useSession();
  return claims?.role === 'store' ? store : reviewer;
}

/** A zone of the store's report: edited while the report is a draft, then its feedback and corrections. */
function StoreZoneRoute() {
  const { reportId = '' } = useParams();
  const report = useReport(reportId);
  if (report.loading) return <Loading />;
  // A missing report or a failed read is handled by the draft zone screen, which sends the user back.
  return report.data?.status === 'sent' ? <CorrectionPage /> : <DraftZonePage />;
}

function HomeRoute() {
  const { claims } = useSession();
  return claims?.role === 'store' ? <StoreHome /> : <ReviewHome />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/reset" element={<ResetPage />} />
      <Route element={<RequireAccess />}>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/new" element={<StoreOnly><NewReportPage /></StoreOnly>} />
        <Route path="/r/:reportId" element={<ByRole store={<DraftReportPage />} reviewer={<ReviewReportPage />} />} />
        <Route path="/r/:reportId/z/:zoneId" element={<ByRole store={<StoreZoneRoute />} reviewer={<ReviewZonePage />} />} />
        <Route path="/overview" element={<ReviewerOnly><OverviewPage /></ReviewerOnly>} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
