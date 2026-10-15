import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { isOverdue } from '@shared/dates';
import { canSend } from '@shared/status';
import type { ReportDoc, ZoneDoc } from '@shared/types';
import { sendReport } from '../api';
import { useReport, useStore, useZones } from '../data/hooks';
import { useT } from '../i18n/I18nProvider';
import { Loading } from '../ui/Loading';
import { StatusBadge } from '../ui/StatusBadge';
import { useToast } from '../ui/Toast';
import { reportStatusLabel } from './reportStatusLabel';

/** The state shown for a zone: a correction past its deadline reads Overdue. */
function badgeState(zone: ZoneDoc, report: ReportDoc, now: number): ZoneDoc['state'] | 'overdue' {
  return zone.state === 'needs_correction' && isOverdue(zone.earliestOpenDeadline, now, report.timezone) ? 'overdue' : zone.state;
}

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

  if (report.loading || zones.loading || store.loading) return <Loading />;
  if (report.error || zones.error) return <p role="alert">{t('error.generic')}</p>;
  if (!report.data) return <Navigate to="/" replace />;
  const current = report.data;

  const departments: Array<{ id: string; name: string; zones: ZoneDoc[] }> = [];
  for (const zone of zones.data) {
    let department = departments.find((d) => d.id === zone.departmentId);
    if (!department) {
      department = {
        id: zone.departmentId,
        name: store.data?.departments.find((d) => d.id === zone.departmentId)?.name ?? zone.departmentId.toUpperCase(),
        zones: [],
      };
      departments.push(department);
    }
    department.zones.push(zone);
  }

  const isDraft = current.status === 'draft';
  const ready = canSend(zones.data.map((z) => z.state));
  const now = Date.now();

  async function send() {
    if (sendStarted.current) return;
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

      {departments.map((department) => (
        <section key={department.id}>
          <h2 className="dept-heading">{department.name}</h2>
          <ul className="rows">
            {department.zones.map((zone) => (
              <li key={zone.id}>
                <Link to={`/r/${current.id}/z/${zone.id}`} className="row-link">
                  <span className="row-title">{zone.name}</span>
                  <StatusBadge state={badgeState(zone, current, now)} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {isDraft && (
        <div className="action-bar">
          {!ready && <p className="hint">{t('store.sendHint')}</p>}
          <button type="button" className="btn btn-primary" disabled={!ready || sending} onClick={() => void send()}>
            {t('store.send')}
          </button>
        </div>
      )}
    </>
  );
}
