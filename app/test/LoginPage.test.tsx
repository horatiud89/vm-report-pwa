import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
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

beforeEach(() => {
  authMocks.signInWithEmailAndPassword.mockReset().mockResolvedValue({});
  authMocks.sendPasswordResetEmail.mockReset().mockResolvedValue(undefined);
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
