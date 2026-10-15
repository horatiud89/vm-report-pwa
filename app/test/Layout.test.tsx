import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import type { Role } from '@shared/types';
import type { ForegroundMessage } from '../src/push/push';
import { Layout } from '../src/ui/Layout';
import { renderApp, signedIn } from './helpers';

const push = vi.hoisted(() => ({ enablePush: vi.fn(), disablePush: vi.fn(), refreshPush: vi.fn(), onForegroundMessage: vi.fn() }));

vi.mock('../src/push/push', () => push);
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));

const IPHONE_17_4 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_16_3 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

const unsubscribe = vi.fn();

/** A phone: its user agent, whether it runs from the Home Screen, and its notification permission (none: no API). */
function onDevice(ua: string, { standalone = false, permission }: { standalone?: boolean; permission?: NotificationPermission } = {}) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: standalone && query === '(display-mode: standalone)' }));
  vi.stubGlobal('Notification', permission ? { permission } : undefined);
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderLayout(role: Role = 'store') {
  return renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route path="*" element={<Where />} />
      </Route>
    </Routes>,
    { session: signedIn(role), route: '/' },
  );
}

function installPromptEvent() {
  return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
}

const turnOn = () => screen.queryByRole('button', { name: en['push.enable'] });
const installButton = () => screen.queryByRole('button', { name: en['install.android'] });
const iosGuide = () => screen.queryByRole('heading', { name: en['install.iosTitle'] });

beforeEach(() => {
  push.enablePush.mockReset().mockResolvedValue('granted');
  push.refreshPush.mockReset();
  push.onForegroundMessage.mockReset().mockReturnValue(unsubscribe);
  unsubscribe.mockReset();
});

afterEach(() => {
  cleanup();
  // The install prompt is caught for the whole page; installing ends it.
  window.dispatchEvent(new Event('appinstalled'));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Layout navigation', () => {
  const nav = () => within(screen.getByRole('navigation')).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')]);

  test.each(['avm', 'am', 'head_vm', 'director'] as const)('%s sees Reports, Overview and Settings', (role) => {
    onDevice(ANDROID_CHROME, { permission: 'denied' });
    renderLayout(role);
    expect(nav()).toEqual([[en['nav.home'], '/'], [en['nav.overview'], '/overview'], [en['nav.settings'], '/settings']]);
  });

  test('a store user has no Overview', () => {
    onDevice(ANDROID_CHROME, { permission: 'denied' });
    renderLayout('store');
    expect(nav()).toEqual([[en['nav.home'], '/'], [en['nav.settings'], '/settings']]);
  });
});

describe('Layout banner', () => {
  test('iPhone in Safari: the 3-step Add to Home Screen guide, and no notifications button', () => {
    onDevice(IPHONE_17_4);
    renderLayout();
    expect(iosGuide()).toBeInTheDocument();
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(steps).toEqual([en['install.iosStep1'], en['install.iosStep2'], en['install.iosStep3']]);
    expect(turnOn()).not.toBeInTheDocument();
  });

  test('Android with a captured install prompt: Install app prompts once, then makes way for notifications', async () => {
    onDevice(ANDROID_CHROME, { permission: 'default' });
    renderLayout();
    expect(installButton()).not.toBeInTheDocument();
    expect(turnOn()).toBeInTheDocument();

    const event = installPromptEvent();
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true); // our button instead of Chrome's own mini-infobar
    expect(turnOn()).not.toBeInTheDocument();

    await userEvent.setup().click(installButton()!);
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(installButton()).not.toBeInTheDocument();
    expect(turnOn()).toBeInTheDocument();
  });

  test('an install prompt that came before the screen appeared is still offered', () => {
    onDevice(ANDROID_CHROME, { permission: 'default' });
    window.dispatchEvent(installPromptEvent());
    renderLayout();
    expect(installButton()).toBeInTheDocument();
  });

  test('permission not asked yet: Turn on notifications; granted confirms and hides the button', async () => {
    onDevice(ANDROID_CHROME, { permission: 'default' });
    renderLayout();

    await userEvent.setup().click(turnOn()!);

    expect(push.enablePush).toHaveBeenCalledExactlyOnceWith('u1');
    expect(await screen.findByText(en['push.enabled'])).toBeInTheDocument();
    expect(turnOn()).not.toBeInTheDocument();
  });

  test('the user says no: the button goes away without a message', async () => {
    onDevice(ANDROID_CHROME, { permission: 'default' });
    push.enablePush.mockResolvedValue('denied');
    renderLayout();

    await userEvent.setup().click(turnOn()!);

    expect(turnOn()).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  test('unsupported (e.g. the token could not be saved): generic error, the button stays for another try', async () => {
    onDevice(ANDROID_CHROME, { permission: 'default' });
    push.enablePush.mockResolvedValue('unsupported');
    renderLayout();

    await userEvent.setup().click(turnOn()!);

    expect(await screen.findByText(en['error.generic'])).toBeInTheDocument();
    expect(turnOn()).toBeEnabled();
  });

  test('permission denied earlier: nothing is offered', () => {
    onDevice(ANDROID_CHROME, { permission: 'denied' });
    renderLayout();
    expect(turnOn()).not.toBeInTheDocument();
    expect(push.refreshPush).not.toHaveBeenCalled();
  });

  test('permission already granted: no button, the token is re-registered for this user', () => {
    onDevice(ANDROID_CHROME, { permission: 'granted' });
    renderLayout();
    expect(turnOn()).not.toBeInTheDocument();
    expect(push.refreshPush).toHaveBeenCalledWith('u1');
  });

  test('iPhone Home Screen app on iOS 17.4: the notifications button, no install guide', () => {
    onDevice(IPHONE_17_4, { standalone: true, permission: 'default' });
    renderLayout();
    expect(iosGuide()).not.toBeInTheDocument();
    expect(turnOn()).toBeInTheDocument();
  });

  test('iPhone Home Screen app on iOS 16.3: nothing (push needs 16.4)', () => {
    onDevice(IPHONE_16_3, { standalone: true, permission: 'default' });
    renderLayout();
    expect(iosGuide()).not.toBeInTheDocument();
    expect(turnOn()).not.toBeInTheDocument();
  });
});

describe('Layout foreground pushes', () => {
  test('a push that arrives while the app is open shows its text and Open, which goes to the link in the app', async () => {
    onDevice(ANDROID_CHROME, { permission: 'granted' });
    renderLayout();
    const deliver = push.onForegroundMessage.mock.calls[0]![0] as (p: ForegroundMessage) => void;

    act(() => deliver({ title: 'VM Photo Report', body: '850 Palladium Praha sent a report: Autumn', link: 'https://vm-report.example/r/rep1/z/women-image' }));

    expect(screen.getByRole('status')).toHaveTextContent('850 Palladium Praha sent a report: Autumn');
    await userEvent.setup().click(screen.getByRole('button', { name: en['common.open'] }));
    expect(screen.getByTestId('where')).toHaveTextContent('/r/rep1/z/women-image');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  test('a push without a link shows only its text', () => {
    onDevice(ANDROID_CHROME, { permission: 'granted' });
    renderLayout();
    const deliver = push.onForegroundMessage.mock.calls[0]![0] as (p: ForegroundMessage) => void;

    act(() => deliver({ title: 'VM Photo Report', body: 'Approved: Image' }));

    expect(screen.getByRole('status')).toHaveTextContent('Approved: Image');
    expect(screen.queryByRole('button', { name: en['common.open'] })).not.toBeInTheDocument();
  });

  test('stops listening when the layout goes away', () => {
    onDevice(ANDROID_CHROME, { permission: 'granted' });
    const { unmount } = renderLayout();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('a browser without push does not listen at all', () => {
    onDevice(IPHONE_17_4);
    renderLayout();
    expect(push.onForegroundMessage).not.toHaveBeenCalled();
  });
});
