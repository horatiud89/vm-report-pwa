import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { approveAllWithoutFeedback, markSeen } from '../api';
import { useReport, useStore, useZones } from '../data/hooks';
import { formatDate } from '../i18n/formatDate';
import { useT } from '../i18n/I18nProvider';
import { reportStatusLabel } from '../store/reportStatusLabel';
import { DepartmentZones } from '../ui/DepartmentZones';
import { Loading } from '../ui/Loading';
import { useToast } from '../ui/Toast';

/** A sent report as the reviewer sees it: the zones by department with their status, and Approve all without feedback. */
export function ReviewReportPage() {
  const { reportId = '' } = useParams();
  const { t, lang } = useT();
  const toast = useToast();
  const report = useReport(reportId);
  const zones = useZones(reportId);
  const store = useStore(report.data?.storeId ?? '');
  const [approving, setApproving] = useState(false);
  const approveStarted = useRef(false);

  // Opening the report is what takes the New mark away. It is told once per open (also under React's double
  // effect in development); a failure only means the mark stays, so it is ignored.
  const seenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!reportId || seenFor.current === reportId) return;
    seenFor.current = reportId;
    void (async () => {
      try {
        await markSeen({ reportId });
      } catch {
        // Not worth bothering the reviewer with.
      }
    })();
  }, [reportId]);

  if (report.loading || zones.loading || store.loading) return <Loading />;
  if (report.error || zones.error) return <p role="alert">{t('error.generic')}</p>;
  if (!report.data) return <Navigate to="/" replace />;
  const current = report.data;

  const waiting = zones.data.filter((z) => z.state === 'submitted').length;

  async function approveAll() {
    if (approveStarted.current) return;
    if (!window.confirm(t('review.approveAllConfirm', { n: waiting }))) return;
    approveStarted.current = true;
    setApproving(true);
    try {
      const { approved } = await approveAllWithoutFeedback({ reportId });
      toast(t('review.approvedCount', { n: approved }));
    } catch {
      toast(t('error.generic'));
    } finally {
      approveStarted.current = false;
      setApproving(false);
    }
  }

  return (
    <>
      <Link to="/" className="back-link">{t('common.back')}</Link>
      <h1>{current.storeCode} {current.storeName}</h1>
      <p className="muted">{current.campaignName} · {current.country} · {formatDate(lang, current.sentAt ?? current.createdAt, current.timezone)}</p>
      <p><span className="tag">{reportStatusLabel(t, current)}</span></p>

      <DepartmentZones report={current} zones={zones.data} store={store.data} />

      {waiting > 0 && (
        <div className="action-bar">
          <button type="button" className="btn btn-primary" disabled={approving} onClick={() => void approveAll()}>
            {t('review.approveAll')}
          </button>
        </div>
      )}
    </>
  );
}
