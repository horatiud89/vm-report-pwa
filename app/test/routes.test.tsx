import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import { AppRoutes } from '../src/routes';
import { renderApp, signedIn, signedOut } from './helpers';
import type { Session } from '../src/auth/AuthProvider';

vi.mock('firebase/auth', () => ({ signInWithEmailAndPassword: vi.fn(), sendPasswordResetEmail: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));

const loginHeading = () => screen.queryByRole('heading', { name: en['login.title'] });

describe('routing', () => {
  test('signed-out users are sent from / to the login page', () => {
    renderApp(<AppRoutes />, { session: signedOut, route: '/' });
    expect(loginHeading()).toBeInTheDocument();
  });

  test('signed-out users are sent from /settings to the login page', () => {
    renderApp(<AppRoutes />, { session: signedOut, route: '/settings' });
    expect(loginHeading()).toBeInTheDocument();
  });

  test('/reset is reachable without signing in', () => {
    renderApp(<AppRoutes />, { session: signedOut, route: '/reset' });
    expect(screen.getByRole('button', { name: en['reset.submit'] })).toBeInTheDocument();
  });

  test('signed-in users visiting /login land on the home shell', () => {
    renderApp(<AppRoutes />, { session: signedIn('store'), route: '/login' });
    expect(loginHeading()).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'VM Photo Report' })).toBeInTheDocument();
  });

  test('nothing is rendered while the session is loading', () => {
    const loading: Session = { ...signedOut, loading: true };
    renderApp(<AppRoutes />, { session: loading, route: '/settings' });
    expect(loginHeading()).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('home shows the role label and, for a store user, the store code', () => {
    renderApp(<AppRoutes />, { session: signedIn('store'), route: '/' });
    expect(screen.getByText('Store · 850')).toBeInTheDocument();
  });

  test('home shows the reviewer role label without a store code', () => {
    renderApp(<AppRoutes />, { session: signedIn('head_vm'), route: '/' });
    expect(screen.getByText('Head of VM')).toBeInTheDocument();
  });

  test('unknown paths fall back to the home shell', () => {
    renderApp(<AppRoutes />, { session: signedIn('avm'), route: '/nope' });
    expect(screen.getByText('Area VM')).toBeInTheDocument();
  });

  test('a signed-in user without a role claim sees the no-access message and can log out', async () => {
    const session: Session = { ...signedIn('store'), claims: null };
    renderApp(<AppRoutes />, { session, route: '/' });

    expect(screen.getByText(en['error.noAccess'])).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: en['settings.logout'] }));
    expect(session.logout).toHaveBeenCalled();
  });
});

describe('settings', () => {
  test('lists the four languages by their own names and logs out', async () => {
    const session = signedIn('store');
    renderApp(<AppRoutes />, { session, route: '/settings' });

    for (const name of ['English', 'Čeština', 'Slovenčina', 'Română']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();

    await userEvent.setup().click(screen.getByRole('button', { name: en['settings.logout'] }));
    expect(session.logout).toHaveBeenCalled();
  });
});
