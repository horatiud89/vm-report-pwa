import { Link } from 'react-router-dom';
import type { Claims, ReportDoc } from '@shared/types';
import { useSession } from '../auth/AuthProvider';
import { useSentReports } from '../data/hooks';
import { formatDate } from '../i18n/formatDate';
import { useT } from '../i18n/I18nProvider';
import { reportStatusLabel } from '../store/reportStatusLabel';
import { Loading } from '../ui/Loading';
import { canFilterCountries, CountryFilterField, useCountryFilter } from './countryFilter';

/** The first screen of a reviewer: the sent reports of their countries, the ones not opened yet marked New. */
export function ReviewHome() {
  const { user, claims } = useSession();
  if (!user || !claims) return null;
  return <ReportList uid={user.uid} claims={claims} />;
}

function ReportList({ uid, claims }: { uid: string; claims: Claims }) {
  const { t, lang } = useT();
  const canFilter = canFilterCountries(claims);
  const [country, chooseCountry] = useCountryFilter();
  const reports = useSentReports(claims, canFilter ? country : 'all');

  const date = (r: ReportDoc) => formatDate(lang, r.sentAt ?? r.createdAt, r.timezone);

  return (
    <>
      <h1>{t('nav.home')}</h1>

      {canFilter && <CountryFilterField value={country} onChange={chooseCountry} />}

      {reports.loading ? <Loading /> : reports.error ? (
        <p role="alert">{t('error.generic')}</p>
      ) : reports.data.length === 0 ? (
        <p className="muted">{t('review.noReports')}</p>
      ) : (
        <ul className="rows">
          {reports.data.map((r) => (
            <li key={r.id}>
              <Link to={`/r/${r.id}`} className="row-link">
                <span className="row-main">
                  <span className="row-title">{r.storeCode} {r.storeName}</span>
                  <span className="row-sub">{r.country} · {r.campaignName}</span>
                  <span className="row-sub">{date(r)}</span>
                </span>
                <span className="row-side">
                  {!r.seenBy.includes(uid) && <span className="new-badge">{t('review.new')}</span>}
                  <span className="tag">{reportStatusLabel(t, r)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
