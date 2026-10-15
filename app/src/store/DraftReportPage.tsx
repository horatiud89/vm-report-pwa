import { useRef, useState, useSyncExternalStore } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { canSend } from '@shared/status';
import { sendReport } from '../api';
import { useReport, useStore, useZones } from '../data/hooks';
import { useT } from '../i18n/I18nProvider';
import { DepartmentZones } from '../ui/DepartmentZones';
import { Loading } from '../ui/Loading';
import { useToast } from '../ui/Toast';
import { reportStatusLabel } from './reportStatusLabel';
import { reportSaveState, retryFailedSaves, subscribeSessions } from './zoneSession';

/**
 * The report's zones by department. A draft is edited zone by zone and sent from here; a sent report shows the
 * same list read-only (corrections have their own screen on the zone).
 */
export function DraftReportPage() {
  const { reportId = '' } = useParams();
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const report = useReport(reportId);
  const zones = useZones(reportId);
  const store = useStore(report.data?.storeId ?? '');
  const [sending, setSending] = useState(false);
  const sendStarted = useRef(false);
  // Photos and comments of a zone may still be on their way (the user can leave a zone before they are stored).
  const saveState = useSyncExternalStore(subscribeSessions, () => reportSaveState(reportId));

  if (report.loading || zones.loading || store.loading) return <Loading />;
  if (report.error || zones.error) return <p role="alert">{t('error.generic')}</p>;
  if (!report.data) return <Navigate to="/" replace />;
  const current = report.data;

  const isDraft = current.status === 'draft';
  const complete = canSend(zones.data.map((z) => z.state));
  const ready = complete && saveState === 'idle';

  async function send() {
    if (sendStarted.current || saveState !== 'idle') return;
    sendStarted.current = true;
    setSending(true);
    try {
      await sendReport({ reportId });
      toast(t('store.sent'));
      navigate('/');
    } catch {
      sendStarted.current = false;
      setSending(false);
      toast(t('error.generic'));
    }
  }

  return (
    <>
      <Link to="/" className="back-link">{t('common.back')}</Link>
      <h1>{current.campaignName}</h1>
      <p><span className="tag">{reportStatusLabel(t, current)}</span></p>

      <DepartmentZones report={current} zones={zones.data} store={store.data} />

      {isDraft && (
        <div className="action-bar">
          {saveState === 'pending' && <p className="hint">{t('store.saving')}</p>}
          {saveState === 'failed' && (
            <div className="hint" role="alert">
              <p>{t('error.generic')}</p>
              <button type="button" className="btn btn-small" onClick={() => retryFailedSaves(reportId)}>{t('common.retry')}</button>
            </div>
          )}
          {saveState === 'idle' && !complete && <p className="hint">{t('store.sendHint')}</p>}
          <button type="button" className="btn btn-primary" disabled={!ready || sending} onClick={() => void send()}>
            {t('store.send')}
          </button>
        </div>
      )}
    </>
  );
}
