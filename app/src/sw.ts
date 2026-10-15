/// <reference lib="webworker" />
import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging/sw';
import { clientsClaim } from 'workbox-core';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import type { PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { firebaseConfig } from './firebaseConfig';
import { notificationPath } from './push/link';
import { mustShowEveryPush } from './push/platform';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> };

// registerType 'autoUpdate': a new version takes over as soon as it is installed.
void self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);

// Every page load of the single-page app is answered with the cached shell, also offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// Push: who does what.
// - Showing: FCM's SDK (getMessaging below) shows each `notification` payload while no app window is visible;
//   with the app on screen it passes the message to onMessage in the page instead (a toast there). The one
//   exception is Safari (iPhone/iPad Home Screen app): a push that shows nothing would cost the subscription,
//   so while an app window is visible this worker shows the notification itself, next to the page's toast.
// - Tapping: this listener is added before getMessaging, so it runs before the SDK's own. It owns every
//   notification that carries a link (all of ours; FCM keeps the payload under data.FCM_MSG): it focuses an
//   open app window and navigates it to the link, or opens a new window there, and stops the event, because
//   the SDK's listener would only focus an open window without navigating it. Anything without a link is left
//   to the SDK.
self.addEventListener('notificationclick', (event) => {
  const path = notificationPath(event.notification.data);
  if (!path) return;
  event.stopImmediatePropagation();
  event.notification.close();
  event.waitUntil(openInApp(new URL(path, self.location.origin).href));
});

self.addEventListener('push', (event) => {
  if (mustShowEveryPush(self.navigator.userAgent)) event.waitUntil(showWhileAppVisible(event.data));
});

async function showWhileAppVisible(data: PushMessageData | null): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (!windows.some((w) => w.visibilityState === 'visible')) return; // FCM's SDK shows it
  let payload: { notification?: { title?: string; body?: string } };
  try {
    payload = data?.json() ?? {};
  } catch {
    return; // not an FCM message
  }
  // The payload under FCM_MSG, as the SDK stores it, so a tap is handled like any other push.
  await self.registration.showNotification(payload.notification?.title ?? '', {
    body: payload.notification?.body ?? '',
    data: { FCM_MSG: payload },
  });
}

async function openInApp(url: string): Promise<void> {
  // Windows this worker controls, most recently focused first.
  const [open] = await self.clients.matchAll({ type: 'window' });
  if (open) {
    try {
      await open.focus();
      await open.navigate(url);
      return;
    } catch {
      // Not focusable or navigable after all: open the link in a new window instead.
    }
  }
  await self.clients.openWindow(url);
}

// Push needs the complete Firebase config (getMessaging throws without it, e.g. in a local build); the worker
// must still install and serve the app then.
try {
  getMessaging(initializeApp(firebaseConfig));
} catch {
  // No push in this build.
}
