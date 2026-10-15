import { useState } from 'react';
import type { Claims, Country } from '@shared/types';
import { useT } from '../i18n/I18nProvider';

const COUNTRIES: readonly Country[] = ['CZ', 'SK', 'RO'];
const FILTER_KEY = 'vm-review-country';

export type CountryFilter = Country | 'all';

/** Head of VM and Director cover every country and may narrow a list; Area VM and Area Manager have one. */
export function canFilterCountries(claims: Claims): boolean {
  return claims.role === 'head_vm' || claims.role === 'director';
}

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

/** The picked country and a way to pick one; the choice is remembered and shared by every reviewer screen with this filter. */
export function useCountryFilter(): [CountryFilter, (value: string) => void] {
  const [country, setCountry] = useState<CountryFilter>(storedCountry);
  function choose(value: string) {
    const next = COUNTRIES.find((c) => c === value) ?? 'all';
    setCountry(next);
    rememberCountry(next);
  }
  return [country, choose];
}

export function CountryFilterField({ value, onChange }: { value: CountryFilter; onChange: (value: string) => void }) {
  const { t } = useT();
  return (
    <label className="field">
      <span>{t('review.country')}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">{t('review.allCountries')}</option>
        {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}
