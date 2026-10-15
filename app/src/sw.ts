/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import type { PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> };

// registerType 'autoUpdate': a new version takes over as soon as it is installed.
void self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);

// Every page load of the single-page app is answered with the cached shell, also offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));
