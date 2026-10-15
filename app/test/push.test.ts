import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Mock } from 'vitest';

const m = vi.hoisted(() => ({
  isSupported: vi.fn(),
  getMessaging: vi.fn(),
  getToken: vi.fn(),
  deleteToken: vi.fn(),
  onMessage: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
}));

vi.mock('firebase/messaging', () => ({
  isSupported: m.isSupported, getMessaging: m.getMessaging, getToken: m.getToken, deleteToken: m.deleteToken, onMessage: m.onMessage,
}));
vi.mock('firebase/firestore', () => ({ doc: m.doc, updateDoc: m.updateDoc, arrayUnion: m.arrayUnion, arrayRemove: m.arrayRemove }));
vi.mock('../src/firebase', () => ({ app: { name: 'test-app' }, db: { name: 'test-db' } }));

const REGISTRATION = { scope: '/' };
const MESSAGING = { name: 'test-messaging' };
const LINK = 'https://vm-report.example/r/rep1/z/women-image';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

let push: typeof import('../src/push/push');
let requestPermission: Mock;
let notification: { permission: NotificationPermission; requestPermission: Mock };

const userDoc = { path: 'users/u1' };

beforeEach(async () => {
  // A fresh module per test: "once per page load" state must not leak between tests.
  vi.resetModules();
  push = await import('../src/push/push');
  localStorage.clear();
  m.isSupported.mockReset().mockResolvedValue(true);
  m.getMessaging.mockReset().mockReturnValue(MESSAGING);
  m.getToken.mockReset().mockResolvedValue('token-1');
  m.deleteToken.mockReset().mockResolvedValue(true);
  m.onMessage.mockReset();
  m.doc.mockReset().mockImplementation((_db, ...path: string[]) => ({ path: path.join('/') }));
  m.updateDoc.mockReset().mockResolvedValue(undefined);
  m.arrayUnion.mockReset().mockImplementation((...values: string[]) => ({ union: values }));
  m.arrayRemove.mockReset().mockImplementation((...values: string[]) => ({ remove: values }));
  requestPermission = vi.fn(async () => { notification.permission = 'granted'; return 'granted'; });
  notification = { permission: 'default', requestPermission };
  vi.stubGlobal('Notification', notification);
  vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'vapid-key');
  Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve(REGISTRATION) }, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

/** Enables push for u1 with token-1, then clears the call history so a test sees only what follows. */
async function enabled() {
  expect(await push.enablePush('u1')).toBe('granted');
  vi.clearAllMocks();
}

describe('enablePush', () => {
  test('asks for permission, gets a token for the app’s own service worker and adds it to users/{uid} with arrayUnion', async () => {
    expect(await push.enablePush('u1')).toBe('granted');

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(m.getMessaging).toHaveBeenCalledWith({ name: 'test-app' });
    expect(m.getToken).toHaveBeenCalledWith(MESSAGING, { vapidKey: 'vapid-key', serviceWorkerRegistration: REGISTRATION });
    expect(m.doc).toHaveBeenCalledWith({ name: 'test-db' }, 'users', 'u1');
    expect(m.updateDoc).toHaveBeenCalledExactlyOnceWith(userDoc, { fcmTokens: { union: ['token-1'] } });
  });

  test('asks for permission at once, while the browser still counts the tap (iOS ignores a later request)', async () => {
    const result = push.enablePush('u1');
    expect(requestPermission).toHaveBeenCalledTimes(1);
    await result;
  });

  test.each(['denied', 'default'] as const)('permission answered "%s": denied, nothing written', async (answer) => {
    requestPermission.mockResolvedValue(answer);
    expect(await push.enablePush('u1')).toBe('denied');
    expect(m.getToken).not.toHaveBeenCalled();
    expect(m.updateDoc).not.toHaveBeenCalled();
  });

  test('unsupported when the messaging SDK says this browser cannot do push', async () => {
    m.isSupported.mockResolvedValue(false);
    expect(await push.enablePush('u1')).toBe('unsupported');
    expect(m.getToken).not.toHaveBeenCalled();
    expect(m.updateDoc).not.toHaveBeenCalled();
  });

  test('unsupported without the Notification API, without asking anything', async () => {
    vi.stubGlobal('Notification', undefined);
    expect(await push.enablePush('u1')).toBe('unsupported');
    expect(m.getToken).not.toHaveBeenCalled();
  });

  test('unsupported without a VAPID key, without asking for permission', async () => {
    vi.stubEnv('VITE_FIREBASE_VAPID_KEY', '');
    expect(await push.enablePush('u1')).toBe('unsupported');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(m.getToken).not.toHaveBeenCalled();
  });

  test('unsupported in an iPhone Safari tab (push needs the Home Screen app), without asking for permission', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI);
    expect(await push.enablePush('u1')).toBe('unsupported');
    expect(requestPermission).not.toHaveBeenCalled();
  });

  test('a token that cannot be read is unsupported, nothing written', async () => {
    m.getToken.mockRejectedValue(new Error('messaging/token-subscribe-failed'));
    expect(await push.enablePush('u1')).toBe('unsupported');
    expect(m.updateDoc).not.toHaveBeenCalled();
  });

  test('a token that cannot be saved (e.g. 10 devices already) is unsupported and not remembered', async () => {
    m.updateDoc.mockRejectedValue(new Error('permission-denied'));
    expect(await push.enablePush('u1')).toBe('unsupported');

    vi.clearAllMocks();
    await push.disablePush('u1');
    expect(m.updateDoc).not.toHaveBeenCalled();
    expect(m.deleteToken).not.toHaveBeenCalled();
  });
});

describe('disablePush', () => {
  test('deletes the token and removes exactly the remembered one from users/{uid} with arrayRemove', async () => {
    await enabled();
    await push.disablePush('u1');

    expect(m.updateDoc).toHaveBeenCalledExactlyOnceWith(userDoc, { fcmTokens: { remove: ['token-1'] } });
    expect(m.deleteToken).toHaveBeenCalledExactlyOnceWith(MESSAGING);
  });

  test('tells the SDK about the app’s own service worker before deleting (else it registers firebase-messaging-sw.js)', async () => {
    await enabled();
    await push.disablePush('u1');

    expect(m.getToken).toHaveBeenCalledWith(MESSAGING, { vapidKey: 'vapid-key', serviceWorkerRegistration: REGISTRATION });
    expect(m.getToken.mock.invocationCallOrder[0]).toBeLessThan(m.deleteToken.mock.invocationCallOrder[0]!);
  });

  test('forgets the token: a second call does nothing', async () => {
    await enabled();
    await push.disablePush('u1');
    vi.clearAllMocks();

    await push.disablePush('u1');
    expect(m.updateDoc).not.toHaveBeenCalled();
    expect(m.deleteToken).not.toHaveBeenCalled();
  });

  test('does nothing on a device that never registered a token', async () => {
    await push.disablePush('u1');
    expect(m.updateDoc).not.toHaveBeenCalled();
    expect(m.getToken).not.toHaveBeenCalled();
    expect(m.deleteToken).not.toHaveBeenCalled();
  });

  test('with permission withdrawn since, only removes the token from the user and asks nothing', async () => {
    await enabled();
    notification.permission = 'denied';
    await push.disablePush('u1');

    expect(m.updateDoc).toHaveBeenCalledExactlyOnceWith(userDoc, { fcmTokens: { remove: ['token-1'] } });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(m.getToken).not.toHaveBeenCalled();
    expect(m.deleteToken).not.toHaveBeenCalled();
  });

  test('a failing deleteToken still removes the token from the user and does not throw', async () => {
    await enabled();
    m.deleteToken.mockRejectedValue(new Error('offline'));
    await expect(push.disablePush('u1')).resolves.toBeUndefined();
    expect(m.updateDoc).toHaveBeenCalledExactlyOnceWith(userDoc, { fcmTokens: { remove: ['token-1'] } });
  });

  test('a failing write still deletes the token and does not throw', async () => {
    await enabled();
    m.updateDoc.mockRejectedValue(new Error('offline'));
    await expect(push.disablePush('u1')).resolves.toBeUndefined();
    expect(m.deleteToken).toHaveBeenCalledTimes(1);
  });

  test('a token that could not be taken off the user is not forgotten: the next logout tries again', async () => {
    await enabled();
    m.updateDoc.mockRejectedValueOnce(new Error('offline'));
    await push.disablePush('u1');
    vi.clearAllMocks();

    await push.disablePush('u1');
    expect(m.updateDoc).toHaveBeenCalledExactlyOnceWith(userDoc, { fcmTokens: { remove: ['token-1'] } });
  });
});

describe('the next account on the same device', () => {
  /** FCM keeps handing out the same token until it is deleted; then it mints a new one. */
  function fcmTokens() {
    let current = 'token-1';
    m.getToken.mockImplementation(async () => current);
    m.deleteToken.mockImplementation(async () => { current = 'token-2'; return true; });
  }

  /** u1 enabled push, then logged out offline: the token stayed on users/u1 and at FCM. */
  async function loggedOutOffline() {
    fcmTokens();
    await enabled();
    m.updateDoc.mockRejectedValueOnce(new Error('offline'));
    m.deleteToken.mockRejectedValueOnce(new Error('offline'));
    await push.disablePush('u1');
    vi.clearAllMocks();
  }

  const writes = () => m.updateDoc.mock.calls.map(([ref, data]) => [(ref as { path: string }).path, data]);

  test('enablePush deletes the token left by the other account first, so it registers a fresh one', async () => {
    await loggedOutOffline();
    expect(await push.enablePush('u2')).toBe('granted');

    expect(m.deleteToken).toHaveBeenCalledTimes(1);
    expect(writes()).toEqual([['users/u2', { fcmTokens: { union: ['token-2'] } }]]);
  });

  test('refreshPush does the same when the next account signs in with notifications already allowed', async () => {
    await loggedOutOffline();
    notification.permission = 'granted';
    push.refreshPush('u2');

    await vi.waitFor(() => expect(m.updateDoc).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([['users/u2', { fcmTokens: { union: ['token-2'] } }]]);
    expect(m.deleteToken).toHaveBeenCalledTimes(1);
  });

  test('the fresh token is the new account’s: its logout removes it from that account', async () => {
    await loggedOutOffline();
    await push.enablePush('u2');
    vi.clearAllMocks();

    await push.disablePush('u2');
    expect(writes()).toEqual([['users/u2', { fcmTokens: { remove: ['token-2'] } }]]);
  });

  test('when the old token cannot be deleted, nothing is registered for the new account', async () => {
    await loggedOutOffline();
    m.deleteToken.mockRejectedValueOnce(new Error('offline'));
    expect(await push.enablePush('u2')).toBe('unsupported');
    expect(m.updateDoc).not.toHaveBeenCalled();
  });

  test('the same account signing in again keeps its token: nothing to delete', async () => {
    await loggedOutOffline();
    expect(await push.enablePush('u1')).toBe('granted');
    expect(m.deleteToken).not.toHaveBeenCalled();
    expect(writes()).toEqual([['users/u1', { fcmTokens: { union: ['token-1'] } }]]);
  });

  test('a logout cannot take another account’s token off its own user, and keeps it for the next sign-in to replace', async () => {
    await loggedOutOffline();
    m.deleteToken.mockRejectedValueOnce(new Error('offline'));
    await push.disablePush('u2'); // u2 signed in, but its re-registration never happened
    expect(m.updateDoc).not.toHaveBeenCalled();

    vi.clearAllMocks();
    expect(await push.enablePush('u2')).toBe('granted');
    expect(m.deleteToken).toHaveBeenCalledTimes(1);
    expect(writes()).toEqual([['users/u2', { fcmTokens: { union: ['token-2'] } }]]);
  });

  test('a token remembered without its account (older app version) is never reused', async () => {
    fcmTokens();
    localStorage.setItem('vm-report.pushToken', 'token-1');
    expect(await push.enablePush('u1')).toBe('granted');
    expect(m.deleteToken).toHaveBeenCalledTimes(1);
    expect(writes()).toEqual([['users/u1', { fcmTokens: { union: ['token-2'] } }]]);
  });
});

describe('refreshPush', () => {
  test('with permission already granted, re-registers the token once per page load without asking', async () => {
    notification.permission = 'granted';
    push.refreshPush('u1');
    push.refreshPush('u1');

    await vi.waitFor(() => expect(m.updateDoc).toHaveBeenCalledTimes(1));
    expect(m.updateDoc).toHaveBeenCalledWith(userDoc, { fcmTokens: { union: ['token-1'] } });
    expect(m.getToken).toHaveBeenCalledTimes(1);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  test('never asks or registers while permission is not granted', async () => {
    push.refreshPush('u1');
    await Promise.resolve();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(m.isSupported).not.toHaveBeenCalled();
    expect(m.getToken).not.toHaveBeenCalled();
  });

  test('runs again after disablePush (log out, log in again) and for another user', async () => {
    notification.permission = 'granted';
    push.refreshPush('u1');
    await vi.waitFor(() => expect(m.updateDoc).toHaveBeenCalledTimes(1));
    await push.disablePush('u1');
    vi.clearAllMocks();

    push.refreshPush('u1');
    await vi.waitFor(() => expect(m.updateDoc).toHaveBeenCalledTimes(1));
    push.refreshPush('u2');
    await vi.waitFor(() => expect(m.updateDoc).toHaveBeenCalledTimes(2));
    expect(m.doc).toHaveBeenLastCalledWith({ name: 'test-db' }, 'users', 'u2');
  });
});

describe('onForegroundMessage', () => {
  function captureHandler() {
    const unsubscribe = vi.fn();
    let handler: ((payload: unknown) => void) | undefined;
    m.onMessage.mockImplementation((_messaging, next: (payload: unknown) => void) => { handler = next; return unsubscribe; });
    return { unsubscribe, deliver: (payload: unknown) => handler?.(payload) };
  }

  test('passes title, body and link of a message that arrives while the app is open', async () => {
    const sdk = captureHandler();
    const cb = vi.fn();
    push.onForegroundMessage(cb);
    await vi.waitFor(() => expect(m.onMessage).toHaveBeenCalledWith(MESSAGING, expect.any(Function)));

    sdk.deliver({ notification: { title: 'VM Photo Report', body: 'Approved: Image' }, fcmOptions: { link: LINK }, data: { link: LINK } });
    expect(cb).toHaveBeenCalledWith({ title: 'VM Photo Report', body: 'Approved: Image', link: LINK });

    sdk.deliver({ notification: { title: 'VM Photo Report', body: 'b' }, data: { link: LINK } });
    expect(cb).toHaveBeenLastCalledWith({ title: 'VM Photo Report', body: 'b', link: LINK });

    sdk.deliver({ data: {} });
    expect(cb).toHaveBeenLastCalledWith({ title: '', body: '' });
  });

  test('the returned function stops listening', async () => {
    const sdk = captureHandler();
    const stop = push.onForegroundMessage(vi.fn());
    await vi.waitFor(() => expect(m.onMessage).toHaveBeenCalled());
    stop();
    expect(sdk.unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('stopping before the support check finishes never subscribes', async () => {
    let answer: (supported: boolean) => void = () => {};
    m.isSupported.mockReturnValue(new Promise<boolean>((resolve) => { answer = resolve; }));
    const stop = push.onForegroundMessage(vi.fn());
    stop();
    answer(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(m.onMessage).not.toHaveBeenCalled();
  });

  test('does not touch messaging where the SDK does not support it', async () => {
    m.isSupported.mockResolvedValue(false);
    push.onForegroundMessage(vi.fn());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(m.getMessaging).not.toHaveBeenCalled();
    expect(m.onMessage).not.toHaveBeenCalled();
  });
});
