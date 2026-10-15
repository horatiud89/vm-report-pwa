import { useState } from 'react';
import { Link } from 'react-router-dom';
import { stateLabel } from '@shared/i18n';
import { countStates } from '@shared/status';
import type { Claims, ReportDoc } from '@shared/types';
import { useSession } from '../auth/AuthProvider';
import { useSentReports, useStore } from '../data/hooks';
import { formatDate } from '../i18n/formatDate';
import { useT } from '../i18n/I18nProvider';
import { shownState } from '../store/zoneBadge';
import { BADGE_STYLE } from '../ui/badgeStyle';
import type { BadgeState } from '../ui/badgeStyle';
import { Loading } from '../ui/Loading';
import { canFilterCountries, CountryFilterField, useCountryFilter } from './countryFilter';

/** The latest sent report of each store: the first one met per store, as the reports come newest sent first. */
function latestPerStore(reports: ReportDoc[]): ReportDoc[] {
  const latest = new Map<string, ReportDoc>();
  for (const report of reports) {
    if (!latest.has(report.storeId)) latest.set(report.storeId, report);
  }
  return [...latest.values()];
}

/** Zones needing correction (before their deadline), zones overdue, and zones approved. Overdue ones are not counted twice. */
function counters(report: ReportDoc, now: number) {
  const overdue = Object.values(report.zoneSummary)
    .filter((z) => shownState(z.state, z.deadline, report.timezone, now) === 'overdue').length;
  const counts = countStates(report.zoneSummary);
  return [
    { state: 'needs_correction', count: counts.needs_correction - overdue },
    { state: 'overdue', count: overdue },
    { state: 'approved', count: counts.approved },
  ] as const;
}

/** The overview for reviewers: one card per store with its latest sent report, a grid of its zones and the counters. */
export function OverviewPage() {
  const { claims } = useSession();
  if (!claims) return null;
  return <Overview claims={claims} />;
}

function Overview({ claims }: { claims: Claims }) {
  const { t } = useT();
  const canFilter = canFilterCountries(claims);
  const [country, chooseCountry] = useCountryFilter();
  const reports = useSentReports(claims, canFilter ? country : 'all');
  const now = Date.now();

  return (
    <>
      <h1>{t('nav.overview')}</h1>

      {canFilter && <CountryFilterField value={country} onChange={chooseCountry} />}

      {reports.loading ? <Loading /> : reports.error ? (
        <p role="alert">{t('error.generic')}</p>
      ) : reports.data.length === 0 ? (
        <p className="muted">{t('overview.empty')}</p>
      ) : (
        <ul className="rows">
          {latestPerStore(reports.data).map((report) => <StoreCard key={report.storeId} report={report} now={now} />)}
        </ul>
      )}
    </>
  );
}

function StoreCard({ report, now }: { report: ReportDoc; now: number }) {
  const { lang } = useT();
  return (
    <li className="overview-card">
      <Link to={`/r/${report.id}`} className="row-link overview-link">
        <div className="row-main">
          <span className="row-title">{report.storeCode} {report.storeName}</span>
          <span className="row-sub">{report.country} · {report.campaignName}</span>
          <span className="row-sub">{formatDate(lang, report.sentAt ?? report.createdAt, report.timezone)}</span>
        </div>
        <ul className="counters">
          {counters(report, now).map(({ state, count }) => (
            <li key={state}>
              <span className="counter-swatch" style={BADGE_STYLE[state]} aria-hidden="true" />
              <span className="counter-value">{count}</span> {stateLabel(lang, state)}
            </li>
          ))}
        </ul>
      </Link>
      <ZoneGrid report={report} now={now} />
    </li>
  );
}

/**
 * Every zone of the report as a small square in its status colour, grouped by department. Touch screens show
 * no title tooltips, so a square is a button: pressing it shows "zone name: status" in a caption under the grid
 * (press it again to clear). The title and label carry the same text. The grid is not part of the card's link,
 * so pressing a square never leaves for the report.
 */
function ZoneGrid({ report, now }: { report: ReportDoc; now: number }) {
  const { lang } = useT();
  const store = useStore(report.storeId);
  const [selected, setSelected] = useState<string | null>(null);
  if (!store.data) return null;

  const departments = store.data.departments
    .map((department) => ({
      ...department,
      squares: department.zones.flatMap((zone) => {
        const summary = report.zoneSummary[zone.id];
        if (!summary) return [];
        const state: BadgeState = shownState(summary.state, summary.deadline, report.timezone, now);
        return [{ id: zone.id, state, label: `${zone.name}: ${stateLabel(lang, state)}` }];
      }),
    }))
    .filter((department) => department.squares.length > 0);
  const caption = departments.flatMap((d) => d.squares).find((square) => square.id === selected)?.label;

  return (
    <>
      <div className="zone-departments">
        {departments.map((department) => (
          <div key={department.id} role="group" aria-label={department.name} className="zone-department">
            <span className="zone-department-name" aria-hidden="true">{department.name}</span>
            <div className="zone-grid">
              {department.squares.map((square) => (
                <button
                  key={square.id}
                  type="button"
                  className="zone-square"
                  style={BADGE_STYLE[square.state]}
                  title={square.label}
                  aria-label={square.label}
                  aria-pressed={square.id === selected}
                  onClick={() => setSelected(square.id === selected ? null : square.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {caption && <p role="status" className="zone-caption">{caption}</p>}
    </>
  );
}
