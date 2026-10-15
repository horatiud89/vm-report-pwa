import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import { AuthProvider, useSession } from '../src/auth/AuthProvider';
import { I18nProvider } from '../src/i18n/I18nProvider';
import { AppRoutes } from '../src/routes';
import { ToastProvider } from '../src/ui/Toast';

const mocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mocks.onAuthStateChanged,
  signOut: mocks.signOut,
  signInWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({ doc: mocks.doc, onSnapshot: mocks.onSnapshot, updateDoc: vi.fn() }));
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
  const { user, claims, claimsError, profile, loading, logout, retryClaims } = useSession();
  return (
    <div>
      <p data-testid="state">{JSON.stringify({ uid: user?.uid ?? null, claims, claimsError, language: profile?.language ?? null, loading })}</p>
      <button onClick={() => void logout()}>out</button>
      <button onClick={retryClaims}>retry</button>
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
    expect(state()).toEqual({ uid: 'u1', claims: { role: 'store', country: 'CZ', storeId: '850' }, claimsError: false, language: 'cs', loading: false });
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
    expect(state().claimsError).toBe(false); // the token was read: this really is "no access"
  });

  test('an unreadable token is a claims error, not "no role"', async () => {
    const user = fakeUser({ role: 'store', country: 'CZ', storeId: '850' });
    user.getIdTokenResult.mockRejectedValue(new Error('network-request-failed'));
    signInAs(user);
    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(state().loading).toBe(false));
    expect(state().claims).toBeNull();
    expect(state().claimsError).toBe(true);
  });

  test('retryClaims forces a token refresh and recovers', async () => {
    const user = fakeUser({ role: 'head_vm' });
    user.getIdTokenResult.mockRejectedValueOnce(new Error('network-request-failed'));
    signInAs(user);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(state().claimsError).toBe(true));
    expect(user.getIdTokenResult).toHaveBeenLastCalledWith(false);

    await userEvent.setup().click(screen.getByRole('button', { name: 'retry' }));

    await waitFor(() => expect(state().claims).toEqual({ role: 'head_vm', country: null, storeId: null }));
    expect(state().claimsError).toBe(false);
    expect(user.getIdTokenResult).toHaveBeenLastCalledWith(true);
  });

  test('coming back online after a failed read retries by itself', async () => {
    const user = fakeUser({ role: 'head_vm' });
    user.getIdTokenResult.mockRejectedValueOnce(new Error('network-request-failed'));
    signInAs(user);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(state().claimsError).toBe(true));

    act(() => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(state().claims?.role).toBe('head_vm'));
    expect(state().claimsError).toBe(false);
  });

  test('a token read that never answers becomes a claims error after the wait', async () => {
    vi.useFakeTimers();
    try {
      const user = fakeUser({ role: 'store', country: 'CZ', storeId: '850' });
      user.getIdTokenResult.mockReturnValue(new Promise(() => {}));
      signInAs(user);
      render(<AuthProvider><Probe /></AuthProvider>);

      await act(() => vi.advanceTimersByTimeAsync(0)); // sign-in settles; the token read stays pending
      await act(() => vi.advanceTimersByTimeAsync(7500));
      expect(state().loading).toBe(true);

      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(state()).toMatchObject({ claims: null, claimsError: true, loading: false });
    } finally {
      vi.useRealTimers();
    }
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
      expect(state()).toEqual({ uid: 'u1', claims: { role: 'store', country: 'CZ', storeId: '850' }, claimsError: false, language: null, loading: false });
    } finally {
      vi.useRealTimers();
    }
  });

  test('signed out: no user, not loading, no profile subscription', async () => {
    signInAs(null);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(state().loading).toBe(false));
    expect(state()).toEqual({ uid: null, claims: null, claimsError: false, language: null, loading: false });
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

describe('the app with an unreadable token', () => {
  test('shows the generic error and Try again (not "no access"); Try again then opens the signed-in shell', async () => {
    const user = fakeUser({ role: 'store', country: 'CZ', storeId: '850' });
    user.getIdTokenResult.mockRejectedValueOnce(new Error('network-request-failed'));
    signInAs(user, { ...PROFILE, language: 'en' });
    render(
      <AuthProvider>
        <I18nProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/']}><AppRoutes /></MemoryRouter>
          </ToastProvider>
        </I18nProvider>
      </AuthProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(en['error.generic']);
    expect(screen.queryByText(en['error.noAccess'])).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: en['common.retry'] }));

    expect(await screen.findByRole('heading', { name: 'VM Photo Report' })).toBeInTheDocument();
    expect(screen.getByText('Store · 850')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
