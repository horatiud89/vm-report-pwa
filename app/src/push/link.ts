/**
 * Push links (built by the server from APP_URL) as paths inside this app. Only the path is kept, so a link
 * always opens in this app, whichever of its hosts it was built for. Shared by the page and the service worker:
 * this module must not import anything.
 */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** "/r/…/z/…" (with any query and hash) from an http(s) or relative link; null for anything else. */
export function linkPath(link: unknown): string | null {
  if (typeof link !== 'string' || link === '') return null;
  let url: URL;
  try {
    url = new URL(link, 'https://app.invalid');
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  // A leading "//" would be read as another host.
  return `/${url.pathname.replace(/^\/+/, '')}${url.search}${url.hash}`;
}

/**
 * Where a tapped notification leads. FCM keeps the payload of a notification it showed under data.FCM_MSG,
 * with the link in fcmOptions.link (some browsers deliver it as notification.click_action) and data.link;
 * any other notification may carry data.link itself.
 */
export function notificationPath(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const fcm = isRecord(data.FCM_MSG) ? data.FCM_MSG : {};
  const pick = (o: unknown, key: string): unknown => (isRecord(o) ? o[key] : undefined);
  const candidates = [pick(fcm.fcmOptions, 'link'), pick(fcm.notification, 'click_action'), pick(fcm.data, 'link'), data.link];
  for (const candidate of candidates) {
    const path = linkPath(candidate);
    if (path) return path;
  }
  return null;
}
