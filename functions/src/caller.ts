import { HttpsError } from 'firebase-functions/https';
import { ROLE_LABEL } from '@shared/access';
import type { Claims, Country, Role } from '@shared/types';

export interface Caller { uid: string; claims: Claims; name: string }

// Record types keep these lists exhaustive: a new Role or Country will not compile until it is added here.
const COUNTRIES: Record<Country, true> = { CZ: true, SK: true, RO: true };

const isRole = (v: unknown): v is Role => typeof v === 'string' && Object.hasOwn(ROLE_LABEL, v);
const isCountry = (v: unknown): v is Country => typeof v === 'string' && Object.hasOwn(COUNTRIES, v);
const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/**
 * Trust boundary: turns the verified ID token of a callable request into a Caller. Anything that is not exactly
 * one of the five known roles with the claims that role needs is rejected, never defaulted.
 */
export function callerFrom(auth: { uid: string; token: Record<string, unknown> } | undefined): Caller {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const { role, country, storeId, name } = auth.token;
  if (!isRole(role)) throw new HttpsError('permission-denied', 'Account has no valid role');

  let claims: Claims;
  switch (role) {
    case 'store':
      if (!isNonEmpty(storeId) || !isCountry(country)) throw new HttpsError('permission-denied', 'Store account is missing its store or country');
      claims = { role, country, storeId };
      break;
    case 'avm':
    case 'am':
      if (!isCountry(country)) throw new HttpsError('permission-denied', 'Account is missing its country');
      claims = { role, country, storeId: null };
      break;
    case 'head_vm':
    case 'director':
      claims = { role, country: null, storeId: null };
      break;
  }
  return { uid: auth.uid, claims, name: isNonEmpty(name) ? name : ROLE_LABEL[role] };
}
