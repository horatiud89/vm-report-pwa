import type { Claims, Country, Role } from './types';

export const ROLE_LABEL: Record<Role, string> = {
  store: 'Store',
  avm: 'Area VM',
  am: 'Area Manager',
  head_vm: 'Head of VM',
  director: 'Director of Operations',
};

export function isReviewer(role: Role): boolean {
  return role !== 'store';
}

/** Reviewers of a store: head_vm and director cover every country, avm and am only their own. */
export function isReviewerFor(user: { role: Role; country: Country | null }, storeCountry: Country): boolean {
  switch (user.role) {
    case 'head_vm':
    case 'director':
      return true;
    case 'avm':
    case 'am':
      return user.country === storeCountry;
    case 'store':
      return false;
  }
}

/** Who may read a country's data: the same people who review it; a store user never sees a whole country. */
export function canViewCountry(claims: Claims, country: Country): boolean {
  return isReviewerFor(claims, country);
}

export function canViewStore(claims: Claims, store: { id: string; country: Country }): boolean {
  if (claims.role === 'store') return claims.storeId === store.id;
  return canViewCountry(claims, store.country);
}
