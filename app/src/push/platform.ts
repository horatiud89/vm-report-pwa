export type Platform = 'ios-browser' | 'ios-standalone' | 'android' | 'other';

/**
 * Which kind of phone browser this is. iPadOS Safari asks for desktop sites and reports "Macintosh";
 * a Mac has no touch screen, so Macintosh with more than one touch point is an iPad.
 */
export function detectPlatform(ua: string, maxTouchPoints: number, standalone: boolean): Platform {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (ios) return standalone ? 'ios-standalone' : 'ios-browser';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

/** iOS version from "… OS 17_4_1 like Mac OS X …" as 17.4 (iOS minor versions have always been single digits). */
export function iosVersion(ua: string): number | null {
  const match = / OS (\d+)(?:_(\d+))?(?:_\d+)* like Mac OS X/.exec(ua);
  return match ? Number(`${match[1]}.${match[2] ?? 0}`) : null;
}

/**
 * Whether web push can work here. On iPhone/iPad only the Home Screen app gets it, from iOS 16.4; an iPad
 * Home Screen app has no version in its UA, and there the Notification API (missing before 16.4) decides.
 */
export function pushSupported(p: Platform, iosVer: number | null, hasNotification: boolean): boolean {
  if (p === 'ios-browser') return false;
  if (p === 'ios-standalone') return hasNotification && (iosVer === null || iosVer >= 16.4);
  return hasNotification;
}

/**
 * Safari's web push (WebKit: iPhone and iPad Home Screen apps, Safari on the Mac) allows no silent push: a push
 * that shows no notification counts against the site, and after a few the subscription is revoked. Every iOS
 * browser is WebKit; Chrome elsewhere (also on a Mac) says "Chrome".
 */
export function mustShowEveryPush(ua: string): boolean {
  return /AppleWebKit/.test(ua) && !/Chrome|Chromium|Android/.test(ua);
}

/** This browser's platform: opened from the Home Screen (display-mode standalone, or iOS's navigator.standalone) or not. */
export function currentPlatform(): Platform {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches === true
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0, standalone);
}

/** Whether this browser can get push at all (permission aside). */
export function currentPushSupported(): boolean {
  return pushSupported(currentPlatform(), iosVersion(navigator.userAgent), typeof Notification !== 'undefined');
}
