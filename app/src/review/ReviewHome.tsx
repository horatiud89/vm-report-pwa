import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Claims, Country, ReportDoc } from '@shared/types';
import { useSession } from '../auth/AuthProvider';
import { useSentReports } from '../data/hooks';
import { formatDate } from '../i18n/formatDate';
import { useT } from '../i18n/I18nProvider';
import { reportStatusLabel } from '../store/reportStatusLabel';
import { Loading } from '../ui/Loading';

const COUNTRIES: readonly Country[] = ['CZ', 'SK', 'RO'];
const FILTER_KEY = 'vm-review-country';

type CountryFilter = Country | 'all';

/** The country the reviewer picked last time; storage may be blocked or hold anything, so this never throws. */
function storedCountry(): CountryFilter {
  try {
    const value = localStorage.getItem(FILTER_KEY);
    return COUNTRIES.find((c) => c === value) ?? 'all';
  } catch {
    return 'all';
  }
}

function rememberCountry(country: CountryFilter) {
  try {
    localStorage.setItem(FILTER_KEY, country);
  } catch {
    // The choice just is not remembered.
  }
}

/** The first screen of a reviewer: the sent reports of their countries, the ones not opened yet marked New. */
export function ReviewHome() {
  const { user, claims } = useSession();
  if (!user || !claims) return null;
  return <ReportList uid={user.uid} claims={claims} />;
}

function ReportList({ uid, claims }: { uid: string; claims: Claims }) {
  const { t, lang } = useT();
  // Head of VM and Director cover every country and may narrow the list; Area VM and Area Manager have one.
  const canFilter = claims.role === 'head_vm' || claims.role === 'director';
  const [country, setCountry] = useState<CountryFilter>(storedCountry);
  const reports = useSentReports(claims, canFilter ? country : 'all');

  function choose(value: string) {
    const next = COUNTRIES.find((c) => c === value) ?? 'all';
    setCountry(next);
    rememberCountry(next);
  }

  const date = (r: ReportDoc) => formatDate(lang, r.sentAt ?? r.createdAt, r.timezone);

  return (
    <>
      <h1>{t('nav.home')}</h1>

      {canFilter && (
        <label className="field">
          <span>{t('review.country')}</span>
          <select value={country} onChange={(e) => choose(e.target.value)}>
            <option value="all">{t('review.allCountries')}</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}

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
