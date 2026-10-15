import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AuthProvider, useSession } from '../src/auth/AuthProvider';

const mocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('firebase/auth', () => ({ onAuthStateChanged: mocks.onAuthStateChanged, signOut: mocks.signOut }));
vi.mock('firebase/firestore', () => ({ doc: mocks.doc, onSnapshot: mocks.onSnapshot }));
vi.mock('../src/firebase', () => ({ auth: { name: 'test-auth' }, db: { name: 'test-db' } }));

const PROFILE = { email: 'a@example.com', role: 'store', country: 'CZ', storeId: '850', displayName: 'A', language: 'cs', fcmTokens: [] };

function fakeUser(claims: Record<string, unknown>) {
  return { uid: 'u1', getIdTokenResult: vi.fn().mockResolvedValue({ claims }) };
}

/** Make the mocked auth report `user` and the mocked profile snapshot report `profile`. */
function signInAs(user: ReturnType<typeof fakeUser> | null, profile: unknown = PROFILE) {
  mocks.onAuthStateChanged.mockImplementation((_auth, next) => {
    queueMicrotask(() => next(user));
    return vi.fn();
  });
  mocks.onSnapshot.mockImplementation((_ref, next) => {
    queueMicrotask(() => next({ exists: () => profile !== null, data: () => profile }));
    return vi.fn();
  });
}

function Probe() {
  const { user, claims, profile, loading, logout } = useSession();
  return (
    <div>
      <p data-testid="state">{JSON.stringify({ uid: user?.uid ?? null, claims, language: profile?.language ?? null, loading })}</p>
      <button onClick={() => void logout()}>out</button>
    </div>
  );
}

const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}');

beforeEach(() => {
  mocks.onAuthStateChanged.mockReset();
  mocks.signOut.mockReset().mockResolvedValue(undefined);
  mocks.doc.mockReset().mockImplementation((_db, ...path: string[]) => ({ path: path.join('/') }));
  mocks.onSnapshot.mockReset();
});

describe('AuthProvider', () => {
  test('starts loading, then exposes user, claims and the users/{uid} profile', async () => {
    signInAs(fakeUser({ role: 'store', country: 'CZ', storeId: '850' }));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(state().loading).toBe(true);

    await waitFor(() => expect(state().loading).toBe(false));
    expect(state()).toEqual({ uid: 'u1', claims: { role: 'store', country: 'CZ', storeId: '850' }, language: 'cs', loading: false });
    expect(mocks.doc).toHaveBeenCalledWith({ name: 'test-db' }, 'users', 'u1');
  });

  test('reviewer claims without a store come back with null country/storeId', async () => {
    signInAs(fakeUser({ role: 'head_vm' }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(state().loading).toBe(false));
    expect(state().claims).toEqual({ role: 'head_vm', country: null, storeId: null });
  });

  test.each([
    ['no role claim', {}],
    ['an unknown role', { role: 'superuser' }],
    ['a role that is not a string', { role: 7 }],
  ])('a user with %s has no claims', async (_name, claims) => {
    signInAs(fakeUser(claims));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(state().loading).toBe(false));
    expect(state().uid).toBe('u1');
    expect(state().claims).toBeNull();
  });

  test('a missing users/{uid} document leaves profile null', async () => {
    signInAs(fakeUser({ role: 'store', country: 'CZ', storeId: '850' }), null);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(state().loading).toBe(false));
    expect(state().language).toBeNull();
  });

  test('stops waiting for a profile that never arrives and carries on without it', async () => {
    vi.useFakeTimers();
    try {
      signInAs(fakeUser({ role: 'store', country: 'CZ', storeId: '850' }));
      mocks.onSnapshot.mockImplementation(() => vi.fn()); // offline: no snapshot, no error
      render(<AuthProvider><Probe /></AuthProvider>);

      await act(() => vi.advanceTimersByTimeAsync(0)); // sign-in and token claims settle; only the profile is missing
      await act(() => vi.advanceTimersByTimeAsync(2500));
      expect(state().loading).toBe(true);

      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(state()).toEqual({ uid: 'u1', claims: { role: 'store', country: 'CZ', storeId: '850' }, language: null, loading: false });
    } finally {
      vi.useRealTimers();
    }
  });

  test('signed out: no user, not loading, no profile subscription', async () => {
    signInAs(null);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(state().loading).toBe(false));
    expect(state()).toEqual({ uid: null, claims: null, language: null, loading: false });
    expect(mocks.onSnapshot).not.toHaveBeenCalled();
  });

  test('logout signs out of Firebase Auth', async () => {
    signInAs(fakeUser({ role: 'store', country: 'CZ', storeId: '850' }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(state().loading).toBe(false));

    await userEvent.setup().click(screen.getByRole('button', { name: 'out' }));
    expect(mocks.signOut).toHaveBeenCalledWith({ name: 'test-auth' });
  });
});
