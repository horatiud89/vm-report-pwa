import { Link, useNavigate } from 'react-router-dom';
import { formatDayMonth, isOverdue } from '@shared/dates';
import type { ReportDoc } from '@shared/types';
import { useSession } from '../auth/AuthProvider';
import { useStore, useStoreReports } from '../data/hooks';
import { formatDate } from '../i18n/formatDate';
import { useT } from '../i18n/I18nProvider';
import { APP_TITLE } from '../ui/Layout';
import { Loading } from '../ui/Loading';
import { StatusBadge } from '../ui/StatusBadge';
import { reportStatusLabel } from './reportStatusLabel';
import { useOpenDraft } from './useOpenDraft';

interface Correction {
  reportId: string;
  campaignName: string;
  zoneId: string;
  zoneName: string;
  zoneOrder: number;
  deadline: string | null;
  timezone: string;
}

/** The first screen of a store: corrections still to do, the reports so far, and the New report button. */
export function StoreHome() {
  const { t, lang } = useT();
  const { claims } = useSession();
  const navigate = useNavigate();
  const openDraft = useOpenDraft();
  const storeId = claims?.storeId ?? '';
  const reports = useStoreReports(storeId);
  const store = useStore(storeId);

  if (reports.loading) return <Loading />;
  if (reports.error) return <p role="alert">{t('error.generic')}</p>;

  // Zone names live in the store definition; the report only keeps a state and a deadline per zone id.
  const zoneInfo = new Map(
    (store.data?.departments ?? []).flatMap((d) => d.zones).map((z, order) => [z.id, { name: z.name, order }] as const),
  );
  const now = Date.now();
  const corrections: Correction[] = reports.data
    .filter((r) => r.status === 'sent')
    .flatMap((r) => Object.entries(r.zoneSummary)
      .filter(([, z]) => z.state === 'needs_correction')
      .map(([zoneId, z]) => ({
        reportId: r.id,
        campaignName: r.campaignName,
        zoneId,
        zoneName: zoneInfo.get(zoneId)?.name ?? zoneId,
        zoneOrder: zoneInfo.get(zoneId)?.order ?? 0,
        deadline: z.deadline,
        timezone: r.timezone,
      })))
    // ISO dates sort as text; a correction without a deadline (should not happen) goes last.
    .sort((a, b) => (a.deadline ?? '9999-12-31').localeCompare(b.deadline ?? '9999-12-31') || a.zoneOrder - b.zoneOrder);

  const draft = reports.data.find((r) => r.status === 'draft');
  const newReport = () => (draft ? openDraft(draft.id) : navigate('/new'));
  const reportDate = (r: ReportDoc) => formatDate(lang, r.sentAt ?? r.createdAt, r.timezone);

  return (
    <>
      <h1>{store.data ? `${store.data.code} ${store.data.name}` : APP_TITLE}</h1>

      {corrections.length > 0 && (
        <section>
          <h2>{t('store.correctionsToDo')}</h2>
          <ul className="rows">
            {corrections.map((c) => {
              const overdue = isOverdue(c.deadline, now, c.timezone);
              return (
                <li key={`${c.reportId}/${c.zoneId}`}>
                  <Link to={`/r/${c.reportId}/z/${c.zoneId}`} className="row-link">
                    <span className="row-main">
                      <span className="row-title">{c.zoneName}</span>
                      <span className="row-sub">{c.campaignName}</span>
                    </span>
                    <span className="row-side">
                      <StatusBadge state={overdue ? 'overdue' : 'needs_correction'} />
                      {c.deadline && (
                        <span className={overdue ? 'row-sub is-overdue' : 'row-sub'}>
                          {t('common.deadline', { date: formatDayMonth(c.deadline) })}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2>{t('nav.home')}</h2>
        {reports.data.length === 0 ? (
          <p className="muted">{t('store.noReports')}</p>
        ) : (
          <ul className="rows">
            {reports.data.map((r) => (
              <li key={r.id}>
                <Link to={`/r/${r.id}`} className="row-link">
                  <span className="row-main">
                    <span className="row-title">{r.campaignName}</span>
                    <span className="row-sub">{reportDate(r)}</span>
                  </span>
                  <span className="tag">{reportStatusLabel(t, r)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="action-bar">
        <button type="button" className="btn btn-primary" onClick={newReport}>{t('store.newReport')}</button>
      </div>
    </>
  );
}
