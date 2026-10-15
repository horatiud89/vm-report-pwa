import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import { AppRoutes } from '../src/routes';
import { renderApp, signedIn, signedOut } from './helpers';
import type { Session } from '../src/auth/AuthProvider';

vi.mock('firebase/auth', () => ({ signInWithEmailAndPassword: vi.fn(), sendPasswordResetEmail: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));
vi.mock('../src/api', () => ({ createDraft: vi.fn(), updateDraftZone: vi.fn(), sendReport: vi.fn() }));
// The store screens read live data; here they get fixed reports and zones so that routing alone is tested.
vi.mock('../src/data/hooks', async () => {
  const fixtures = await import('./fixtures');
  const { STORE_850: store } = await import('@shared/store850');
  return {
    useStoreReports: () => fixtures.live([fixtures.makeReport({ campaignName: 'Autumn 2026', status: 'sent', sentAt: 5 })]),
    useReport: () => fixtures.live(fixtures.makeReport({ campaignName: 'Autumn 2026' })),
    useZones: () => fixtures.live(fixtures.allZoneDocs()),
    useZone: () => fixtures.live(fixtures.makeZone('women-image')),
    useStore: () => fixtures.live(store),
    usePhotoUrl: () => null,
  };
});

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

  test('signed-in users visiting /login land on their home', () => {
    renderApp(<AppRoutes />, { session: signedIn('head_vm'), route: '/login' });
    expect(loginHeading()).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'VM Photo Report' })).toBeInTheDocument();

    cleanup();
    renderApp(<AppRoutes />, { session: signedIn('store'), route: '/login' });
    expect(loginHeading()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['store.newReport'] })).toBeInTheDocument();
  });

  test('a neutral busy indicator, and no login form or buttons, show while the session is loading', () => {
    const loading: Session = { ...signedOut, loading: true };
    const { container } = renderApp(<AppRoutes />, { session: loading, route: '/settings' });
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(loginHeading()).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('the login route shows the busy indicator too while the session is loading', () => {
    const loading: Session = { ...signedOut, loading: true };
    const { container } = renderApp(<AppRoutes />, { session: loading, route: '/login' });
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(loginHeading()).not.toBeInTheDocument();
  });

  test('home is the store home for a store user: its reports and the New report button', () => {
    renderApp(<AppRoutes />, { session: signedIn('store'), route: '/' });
    expect(screen.getByText('Autumn 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['store.newReport'] })).toBeInTheDocument();
  });

  test('home shows the reviewer role label without a store code', () => {
    renderApp(<AppRoutes />, { session: signedIn('head_vm'), route: '/' });
    expect(screen.getByText('Head of VM')).toBeInTheDocument();
  });

  test('unknown paths fall back to the home shell', () => {
    renderApp(<AppRoutes />, { session: signedIn('avm'), route: '/nope' });
    expect(screen.getByText('Area VM')).toBeInTheDocument();
  });

  test('an unreadable token shows the generic error with Try again, not "no access", and Try again retries', async () => {
    const session: Session = { ...signedIn('store'), claims: null, claimsError: true };
    renderApp(<AppRoutes />, { session, route: '/' });

    expect(screen.getByRole('alert')).toHaveTextContent(en['error.generic']);
    expect(screen.queryByText(en['error.noAccess'])).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: en['common.retry'] }));
    expect(session.retryClaims).toHaveBeenCalledTimes(1);
  });

  test('an unreadable token still lets the user log out', async () => {
    const session: Session = { ...signedIn('store'), claims: null, claimsError: true };
    renderApp(<AppRoutes />, { session, route: '/' });

    await userEvent.setup().click(screen.getByRole('button', { name: en['settings.logout'] }));
    expect(session.logout).toHaveBeenCalled();
  });

  test('a signed-in user without a role claim sees the no-access message and can log out', async () => {
    const session: Session = { ...signedIn('store'), claims: null };
    renderApp(<AppRoutes />, { session, route: '/' });

    expect(screen.getByText(en['error.noAccess'])).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: en['settings.logout'] }));
    expect(session.logout).toHaveBeenCalled();
  });
});

describe('store routes', () => {
  test('/new shows the new report form', () => {
    renderApp(<AppRoutes />, { session: signedIn('store'), route: '/new' });
    expect(screen.getByLabelText(en['store.campaignName'])).toBeInTheDocument();
  });

  test('/r/:reportId shows the report with its zones', () => {
    renderApp(<AppRoutes />, { session: signedIn('store'), route: '/r/r1' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Autumn 2026');
    expect(screen.getByRole('link', { name: /Women's Image/ })).toHaveAttribute('href', '/r/r1/z/women-image');
  });

  test('/r/:reportId/z/:zoneId shows the zone editor', () => {
    renderApp(<AppRoutes />, { session: signedIn('store'), route: '/r/r1/z/women-image' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Women's Image");
    expect(screen.getByRole('button', { name: en['store.takePhoto'] })).toBeInTheDocument();
  });

  test.each(['/new', '/r/r1', '/r/r1/z/women-image'])('reviewers are sent home from %s (their screens come later)', (route) => {
    renderApp(<AppRoutes />, { session: signedIn('avm'), route });
    expect(screen.getByText('Area VM')).toBeInTheDocument();
  });

  test('signed-out users are sent from /new to the login page', () => {
    renderApp(<AppRoutes />, { session: signedOut, route: '/new' });
    expect(loginHeading()).toBeInTheDocument();
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
