import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import type { ZoneState } from '@shared/types';
import { AppRoutes } from '../src/routes';
import type { Session } from '../src/auth/AuthProvider';
import { photo } from './fixtures';
import { renderApp, signedIn, signedOut } from './helpers';

vi.mock('firebase/auth', () => ({ signInWithEmailAndPassword: vi.fn(), sendPasswordResetEmail: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));
vi.mock('../src/api', () => ({
  createDraft: vi.fn(), updateDraftZone: vi.fn(), sendReport: vi.fn(), sendCorrection: vi.fn(),
  markSeen: vi.fn(), giveFeedback: vi.fn(), approveZone: vi.fn(), approveAllWithoutFeedback: vi.fn(),
}));
// What the mocked report is: a draft, or sent with its zone waiting for a correction; `zone` changes the zone further.
const shown = vi.hoisted(() => ({ sent: false, zone: {} as Record<string, unknown>, zones: 'empty' as ZoneState }));
// The store screens read live data; here they get fixed reports and zones so that routing alone is tested.
vi.mock('../src/data/hooks', async () => {
  const fixtures = await import('./fixtures');
  const { STORE_850: store } = await import('@shared/store850');
  return {
    useStoreReports: () => fixtures.live([fixtures.makeReport({ campaignName: 'Autumn 2026', status: 'sent', sentAt: 5 })]),
    useSentReports: () => fixtures.live([fixtures.makeReport({ campaignName: 'Autumn 2026', status: 'sent', sentAt: 5 })]),
    useReport: () => fixtures.live(fixtures.makeReport({ campaignName: 'Autumn 2026', ...(shown.sent ? { status: 'sent', sentAt: 5 } : {}) })),
    useZones: () => fixtures.live(fixtures.allZoneDocs(shown.zones)),
    useZone: () => fixtures.live(fixtures.makeZone('women-image', { ...(shown.sent ? { state: 'needs_correction' } : {}), ...shown.zone })),
    useFeedback: () => fixtures.live([]),
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
    expect(screen.getByRole('link', { name: /850 Palladium Praha/ })).toBeInTheDocument();

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

  test.each(['avm', 'am', 'head_vm', 'director'] as const)('home is the list of sent reports for %s, with no New report button', (role) => {
    renderApp(<AppRoutes />, { session: signedIn(role, 'en', { country: 'CZ' }), route: '/' });
    expect(screen.getByRole('link', { name: /850 Palladium Praha/ })).toHaveAttribute('href', '/r/r1');
    expect(screen.queryByRole('button', { name: en['store.newReport'] })).not.toBeInTheDocument();
  });

  test('only Head of VM and Director get the country filter on the home screen', () => {
    renderApp(<AppRoutes />, { session: signedIn('director'), route: '/' });
    expect(screen.getByRole('combobox', { name: en['review.country'] })).toBeInTheDocument();
    cleanup();
    renderApp(<AppRoutes />, { session: signedIn('avm', 'en', { country: 'CZ' }), route: '/' });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  test('unknown paths fall back to the home screen', () => {
    renderApp(<AppRoutes />, { session: signedIn('avm', 'en', { country: 'CZ' }), route: '/nope' });
    expect(screen.getByRole('link', { name: /850 Palladium Praha/ })).toBeInTheDocument();
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

  test('/r/:reportId/z/:zoneId of a sent report shows the correction screen, not the editor', () => {
    shown.sent = true;
    try {
      renderApp(<AppRoutes />, { session: signedIn('store'), route: '/r/r1/z/women-image' });
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Women's Image");
      expect(screen.getByRole('button', { name: en['store.sendCorrection'] })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: en['store.takePhoto'] })).toBeInTheDocument(); // the picker for the new photos
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); // the editor's "not part of this campaign" mark
    } finally {
      shown.sent = false;
    }
  });

  test('reviewers are sent home from /new, which is for stores', () => {
    renderApp(<AppRoutes />, { session: signedIn('avm', 'en', { country: 'CZ' }), route: '/new' });
    expect(screen.getByRole('link', { name: /850 Palladium Praha/ })).toBeInTheDocument();
    expect(screen.queryByLabelText(en['store.campaignName'])).not.toBeInTheDocument();
  });

  test('signed-out users are sent from /new to the login page', () => {
    renderApp(<AppRoutes />, { session: signedOut, route: '/new' });
    expect(loginHeading()).toBeInTheDocument();
  });
});

describe('reviewer routes', () => {
  test.each(['avm', 'am', 'head_vm', 'director'] as const)('/r/:reportId shows the report for %s: its zones and Approve all', (role) => {
    shown.zones = 'submitted';
    try {
      renderApp(<AppRoutes />, { session: signedIn(role, 'en', { country: 'CZ' }), route: '/r/r1' });
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('850 Palladium Praha');
      expect(screen.getByRole('link', { name: /Women's Image/ })).toHaveAttribute('href', '/r/r1/z/women-image');
      expect(screen.getByRole('button', { name: en['review.approveAll'] })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: en['store.send'] })).not.toBeInTheDocument();
    } finally {
      shown.zones = 'empty';
    }
  });

  test('/r/:reportId/z/:zoneId shows the zone to review: a form per photo and Approve', () => {
    shown.zone = { state: 'submitted', versions: [{ n: 1, photos: [photo(1)], storeComment: 'Done', createdAt: 1 }] };
    try {
      renderApp(<AppRoutes />, { session: signedIn('head_vm'), route: '/r/r1/z/women-image' });
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Women's Image");
      expect(screen.getByText('Done')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: en['review.sendFeedback'] })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: en['review.approve'] })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: en['store.takePhoto'] })).not.toBeInTheDocument();
    } finally {
      shown.zone = {};
    }
  });
});

describe('overview route', () => {
  test.each(['avm', 'am', 'head_vm', 'director'] as const)('/overview shows the overview for %s: the store card and its zone squares', (role) => {
    renderApp(<AppRoutes />, { session: signedIn(role, 'en', { country: 'CZ' }), route: '/overview' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en['nav.overview']);
    expect(screen.getByRole('link', { name: /850 Palladium Praha/ })).toHaveAttribute('href', '/r/r1');
  });

  test('a store user is sent home from /overview', () => {
    renderApp(<AppRoutes />, { session: signedIn('store'), route: '/overview' });
    expect(screen.queryByRole('heading', { name: en['nav.overview'], level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['store.newReport'] })).toBeInTheDocument();
  });

  test('signed-out users are sent from /overview to the login page', () => {
    renderApp(<AppRoutes />, { session: signedOut, route: '/overview' });
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
