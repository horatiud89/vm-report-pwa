import { describe, expect, test } from 'vitest';
import { callerFrom } from '../src/caller';

const auth = (token: Record<string, unknown>, uid = 'u1') => ({ uid, token });
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
};

describe('callerFrom', () => {
  test('missing auth is unauthenticated', () => {
    expect(codeOf(() => callerFrom(undefined))).toBe('unauthenticated');
  });

  test('a store caller carries storeId and country', () => {
    expect(callerFrom(auth({ role: 'store', storeId: '850', country: 'CZ', name: 'Jana' }))).toEqual({
      uid: 'u1', claims: { role: 'store', country: 'CZ', storeId: '850' }, name: 'Jana',
    });
  });

  test('avm and am carry their country and no store', () => {
    for (const role of ['avm', 'am'] as const) {
      expect(callerFrom(auth({ role, country: 'SK', storeId: '850' })).claims).toEqual({ role, country: 'SK', storeId: null });
    }
  });

  test('head of VM and director have no country or store', () => {
    for (const role of ['head_vm', 'director'] as const) {
      expect(callerFrom(auth({ role, country: 'CZ', storeId: '850' })).claims).toEqual({ role, country: null, storeId: null });
    }
  });

  test('name falls back to the role label when the token has none', () => {
    expect(callerFrom(auth({ role: 'head_vm' })).name).toBe('Head of VM');
    expect(callerFrom(auth({ role: 'director', name: '   ' })).name).toBe('Director of Operations');
    expect(callerFrom(auth({ role: 'avm', country: 'CZ', name: 42 })).name).toBe('Area VM');
  });

  test('a missing or unknown role is permission-denied', () => {
    for (const role of [undefined, null, '', 'intern', 'admin', 'Store', 7, {}, ['store']]) {
      expect(codeOf(() => callerFrom(auth({ role, storeId: '850', country: 'CZ' })))).toBe('permission-denied');
    }
    expect(codeOf(() => callerFrom(auth({})))).toBe('permission-denied');
  });

  test('a store token without storeId or with a bad country is permission-denied', () => {
    expect(codeOf(() => callerFrom(auth({ role: 'store', country: 'CZ' })))).toBe('permission-denied');
    expect(codeOf(() => callerFrom(auth({ role: 'store', country: 'CZ', storeId: '' })))).toBe('permission-denied');
    expect(codeOf(() => callerFrom(auth({ role: 'store', storeId: '850' })))).toBe('permission-denied');
    expect(codeOf(() => callerFrom(auth({ role: 'store', storeId: '850', country: 'DE' })))).toBe('permission-denied');
  });

  test('an avm or am token without a valid country is permission-denied', () => {
    for (const role of ['avm', 'am']) {
      expect(codeOf(() => callerFrom(auth({ role })))).toBe('permission-denied');
      expect(codeOf(() => callerFrom(auth({ role, country: null })))).toBe('permission-denied');
      expect(codeOf(() => callerFrom(auth({ role, country: 'DE' })))).toBe('permission-denied');
    }
  });
});
