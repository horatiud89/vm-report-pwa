import { describe, expect, test } from 'vitest';
import { ROLE_LABEL, canViewCountry, canViewStore, isReviewer, isReviewerFor } from '../src/access';
import type { Claims, Country, Role } from '../src/types';

const claims = (role: Role, country: Country | null, storeId: string | null = null): Claims => ({ role, country, storeId });

describe('ROLE_LABEL', () => {
  test('English labels, one per role', () => {
    expect(ROLE_LABEL).toEqual({
      store: 'Store',
      avm: 'Area VM',
      am: 'Area Manager',
      head_vm: 'Head of VM',
      director: 'Director of Operations',
    });
  });
});

describe('isReviewer', () => {
  test.each<[Role, boolean]>([
    ['store', false],
    ['avm', true],
    ['am', true],
    ['head_vm', true],
    ['director', true],
  ])('%s -> %s', (role, expected) => expect(isReviewer(role)).toBe(expected));
});

describe('canViewCountry', () => {
  test.each<[Role, Country | null, Country, boolean]>([
    ['head_vm', null, 'SK', true],
    ['director', null, 'RO', true],
    ['avm', 'CZ', 'CZ', true],
    ['avm', 'CZ', 'SK', false],
    ['am', 'RO', 'RO', true],
    ['am', 'RO', 'CZ', false],
    ['avm', null, 'CZ', false],
    ['store', 'CZ', 'CZ', false],
  ])('%s (%s) viewing %s -> %s', (role, own, target, expected) =>
    expect(canViewCountry(claims(role, own), target)).toBe(expected));
});

describe('canViewStore', () => {
  test('avm sees a store in own country', () => {
    expect(canViewStore(claims('avm', 'CZ'), { id: '850', country: 'CZ' })).toBe(true);
  });
  test('avm does not see a store in another country', () => {
    expect(canViewStore(claims('avm', 'CZ'), { id: '850', country: 'SK' })).toBe(false);
  });
  test('am sees only own country', () => {
    expect(canViewStore(claims('am', 'RO'), { id: '100', country: 'RO' })).toBe(true);
    expect(canViewStore(claims('am', 'RO'), { id: '850', country: 'CZ' })).toBe(false);
  });
  test('head_vm and director see every country', () => {
    expect(canViewStore(claims('head_vm', null), { id: '900', country: 'SK' })).toBe(true);
    expect(canViewStore(claims('director', null), { id: '100', country: 'RO' })).toBe(true);
  });
  test('store sees own id only', () => {
    expect(canViewStore(claims('store', 'CZ', '850'), { id: '850', country: 'CZ' })).toBe(true);
    expect(canViewStore(claims('store', 'CZ', '850'), { id: '851', country: 'CZ' })).toBe(false);
  });
  test('store without a storeId sees nothing', () => {
    expect(canViewStore(claims('store', 'CZ', null), { id: '850', country: 'CZ' })).toBe(false);
  });
  test('reviewer without a country sees nothing unless global', () => {
    expect(canViewStore(claims('avm', null), { id: '850', country: 'CZ' })).toBe(false);
  });
});

describe('isReviewerFor', () => {
  test.each<[Role, Country | null, Country, boolean]>([
    ['am', 'CZ', 'CZ', true],
    ['am', 'RO', 'CZ', false],
    ['avm', 'SK', 'SK', true],
    ['avm', 'SK', 'CZ', false],
    ['director', null, 'SK', true],
    ['head_vm', null, 'RO', true],
    ['store', 'CZ', 'CZ', false],
    ['avm', null, 'CZ', false],
  ])('%s (%s) for a %s store -> %s', (role, country, storeCountry, expected) =>
    expect(isReviewerFor({ role, country }, storeCountry)).toBe(expected));
});
