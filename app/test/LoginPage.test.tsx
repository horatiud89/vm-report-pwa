import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import { LoginPage } from '../src/auth/LoginPage';
import { ResetPage } from '../src/auth/ResetPage';
import { renderApp } from './helpers';

const authMocks = vi.hoisted(() => ({
  signInWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('firebase/auth', () => authMocks);
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: { name: 'test-auth' }, db: {} }));

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const DESKTOP_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

/** A browser: its user agent and whether it runs as the Home Screen app. */
function onDevice(ua: string, standalone = false) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: standalone && query === '(display-mode: standalone)' }));
}

beforeEach(() => {
  authMocks.signInWithEmailAndPassword.mockReset().mockResolvedValue({});
  authMocks.sendPasswordResetEmail.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LoginPage', () => {
  test('submits the typed email and password to Firebase Auth', async () => {
    const user = userEvent.setup();
    renderApp(<LoginPage />);

    await user.type(screen.getByLabelText(en['login.email']), 'anna@example.com');
    await user.type(screen.getByLabelText(en['login.password']), 'secret-pass');
    await user.click(screen.getByRole('button', { name: en['login.submit'] }));

    expect(authMocks.signInWithEmailAndPassword).toHaveBeenCalledWith({ name: 'test-auth' }, 'anna@example.com', 'secret-pass');
  });

  test('shows the wrong-credentials message when sign-in is refused', async () => {
    authMocks.signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/invalid-credential' });
    const user = userEvent.setup();
    renderApp(<LoginPage />);

    await user.type(screen.getByLabelText(en['login.email']), 'anna@example.com');
    await user.type(screen.getByLabelText(en['login.password']), 'wrong');
    await user.click(screen.getByRole('button', { name: en['login.submit'] }));

    expect(await screen.findByRole('alert')).toHaveTextContent(en['login.error']);
  });

  test('shows the generic error for any other failure', async () => {
    authMocks.signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/network-request-failed' });
    const user = userEvent.setup();
    renderApp(<LoginPage />);

    await user.type(screen.getByLabelText(en['login.email']), 'anna@example.com');
    await user.type(screen.getByLabelText(en['login.password']), 'whatever');
    await user.click(screen.getByRole('button', { name: en['login.submit'] }));

    expect(await screen.findByRole('alert')).toHaveTextContent(en['error.generic']);
  });

  test('the set / forgot password link goes to /reset', async () => {
    const user = userEvent.setup();
    renderApp(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset" element={<ResetPage />} />
      </Routes>,
      { route: '/login' },
    );

    await user.click(screen.getByRole('link', { name: en['login.reset'] }));

    expect(screen.getByRole('heading', { name: en['login.reset'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['reset.submit'] })).toBeInTheDocument();
  });
});

describe('LoginPage: install guide', () => {
  const guide = () => screen.queryByRole('heading', { name: en['install.iosTitle'] });

  test('iPhone in Safari: the 3 steps to add the app to the Home Screen show before signing in, above the form', () => {
    onDevice(IPHONE_SAFARI);
    renderApp(<LoginPage />);
    expect(guide()).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([en['install.iosStep1'], en['install.iosStep2'], en['install.iosStep3']]);
    // Read before the form: signing in here would only have to be done again in the Home Screen app.
    expect(guide()!.compareDocumentPosition(screen.getByLabelText(en['login.email'])) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test.each([
    ['the iPhone Home Screen app', IPHONE_SAFARI, true],
    ['Android Chrome', ANDROID_CHROME, false],
    ['a computer', DESKTOP_CHROME, false],
  ])('not in %s', (_name, ua, standalone) => {
    onDevice(ua, standalone);
    renderApp(<LoginPage />);
    expect(guide()).not.toBeInTheDocument();
  });
});

describe('ResetPage', () => {
  test('sends the reset email and shows the confirmation', async () => {
    const user = userEvent.setup();
    renderApp(<ResetPage />);

    await user.type(screen.getByLabelText(en['login.email']), 'anna@example.com');
    await user.click(screen.getByRole('button', { name: en['reset.submit'] }));

    expect(authMocks.sendPasswordResetEmail).toHaveBeenCalledWith({ name: 'test-auth' }, 'anna@example.com');
    expect(await screen.findByText(en['reset.sent'])).toBeInTheDocument();
  });

  test('shows the generic error when sending fails', async () => {
    authMocks.sendPasswordResetEmail.mockRejectedValue({ code: 'auth/invalid-email' });
    const user = userEvent.setup();
    renderApp(<ResetPage />);

    await user.type(screen.getByLabelText(en['login.email']), 'anna@example.com');
    await user.click(screen.getByRole('button', { name: en['reset.submit'] }));

    expect(await screen.findByRole('alert')).toHaveTextContent(en['error.generic']);
    expect(screen.queryByText(en['reset.sent'])).not.toBeInTheDocument();
  });

  test('has a link back to sign in', () => {
    renderApp(<ResetPage />);
    expect(screen.getByRole('link', { name: en['reset.back'] })).toHaveAttribute('href', '/login');
  });
});
