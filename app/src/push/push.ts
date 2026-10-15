import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { app, db } from '../firebase';
import { currentPushSupported } from './platform';

export type PushResult = 'granted' | 'denied' | 'unsupported';
export interface ForegroundMessage { title: string; body: string; link?: string }

/** The token this device added to a user's fcmTokens, and that user, so logout removes exactly that one. */
const TOKEN_KEY = 'vm-report.pushToken';
interface Remembered { uid: string; token: string }

/** `serviceWorker.ready` never settles without a service worker (vite dev); give up instead of hanging. */
const SW_WAIT_MS = 10_000;

/** The user this page load already re-registered for (see refreshPush). */
let refreshedFor: string | null = null;

/**
 * Turns on push for this device and user. Call it from the tap itself: the permission request comes before
 * any await, because iOS only shows it in a user gesture. 'unsupported' covers no push here at all (no
 * Notification API, an iPhone Safari tab, iOS before 16.4, no VAPID key) and any failure after permission,
 * such as a token write refused by the rules' 10-device limit.
 */
export async function enablePush(uid: string): Promise<PushResult> {
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey || !currentPushSupported()) return 'unsupported';
  try {
    const asked = Notification.permission === 'granted' ? 'granted' : Notification.requestPermission();
    const [answer, supported] = await Promise.all([asked, isSupported()]);
    if (!supported) return 'unsupported';
    if (answer !== 'granted') return 'denied';
    // A token left by another account (its logout could not take it off, e.g. offline) still brings that account's
    // pushes. Deleted first, FCM hands out a fresh token; if it cannot be deleted, nothing is registered.
    const left = rememberedToken();
    if (left && left.uid !== uid) await deleteDeviceToken();
    const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: await appServiceWorker() });
    await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) });
    rememberToken({ uid, token });
    refreshedFor = uid;
    return 'granted';
  } catch {
    return 'unsupported';
  }
}

/**
 * Stops push for this device: removes its remembered token from users/{uid} and deletes it at FCM.
 * Called on logout before signing out (the write needs the session). Never throws. The token is forgotten only
 * once it is off its user's document; until then the next account on this device gets a fresh one (enablePush).
 */
export async function disablePush(uid: string): Promise<void> {
  refreshedFor = null;
  const remembered = rememberedToken();
  if (!remembered) return;
  // Only its own account can take the token off its document (the rules let nobody write another user's).
  const own = remembered.uid === uid;
  const [removed] = await Promise.allSettled([own ? removeFromUser(uid, remembered.token) : Promise.resolve(), deleteDeviceToken()]);
  if (own && removed.status === 'fulfilled') rememberToken(null);
}

/**
 * Keeps a device that already allows notifications registered for this user (a new browser, a rotated
 * token): once per page load and user, and never asks for anything.
 */
export function refreshPush(uid: string): void {
  if (refreshedFor === uid || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  refreshedFor = uid;
  void enablePush(uid);
}

/** Pushes that arrive while the app is visible (FCM then shows no notification). Returns the unsubscribe. */
export function onForegroundMessage(cb: (p: ForegroundMessage) => void): () => void {
  let unsubscribe: (() => void) | undefined;
  let stopped = false;
  isSupported()
    .then((supported) => {
      if (!supported || stopped) return;
      unsubscribe = onMessage(getMessaging(app), ({ notification, fcmOptions, data }) => {
        const link = fcmOptions?.link ?? data?.link;
        cb({ title: notification?.title ?? '', body: notification?.body ?? '', ...(link ? { link } : {}) });
      });
    })
    .catch(() => { /* no messaging here (e.g. an incomplete Firebase config): nothing to listen to */ });
  return () => {
    stopped = true;
    unsubscribe?.();
  };
}

async function removeFromUser(uid: string, token: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) });
}

async function deleteDeviceToken(): Promise<void> {
  // Without permission getToken would ask again; the push subscription is dead then anyway.
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !(await isSupported())) return;
  const messaging = getMessaging(app);
  // deleteToken works on the registration getToken was given; without one it registers firebase-messaging-sw.js.
  await getToken(messaging, { vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY, serviceWorkerRegistration: await appServiceWorker() });
  await deleteToken(messaging);
}

/** The app's own service worker (sw.ts receives the pushes), so FCM does not register a second one. */
async function appServiceWorker(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('no service worker')), SW_WAIT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function rememberedToken(): Remembered | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const { uid, token } = JSON.parse(raw) as Partial<Remembered>;
    if (typeof uid === 'string' && typeof token === 'string') return { uid, token };
  } catch { /* below */ }
  // A bare token from an earlier version of the app: whose it is is unknown, so it belongs to no account here.
  return { uid: '', token: raw };
}

/** Storage may be unavailable (private mode); then logout cannot remove the token from the user document. */
function rememberToken(remembered: Remembered | null): void {
  try {
    if (remembered) localStorage.setItem(TOKEN_KEY, JSON.stringify(remembered));
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* see above */ }
}
