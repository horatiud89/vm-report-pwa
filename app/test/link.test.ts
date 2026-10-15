import { describe, expect, test } from 'vitest';
import { linkPath, notificationPath } from '../src/push/link';

const LINK = 'https://vm-report.example/r/rep1/z/women-image';

describe('linkPath', () => {
  test('keeps path, query and hash of an absolute link', () => {
    expect(linkPath(LINK)).toBe('/r/rep1/z/women-image');
    expect(linkPath('https://vm-report.example/r/rep1?x=1#top')).toBe('/r/rep1?x=1#top');
  });

  test('takes the path of a link built for another host of the same app (web.app vs firebaseapp.com)', () => {
    expect(linkPath('https://other-host.example/r/rep1')).toBe('/r/rep1');
  });

  test('accepts a relative link', () => {
    expect(linkPath('/r/rep1')).toBe('/r/rep1');
  });

  test('never yields a protocol-relative path that would leave the app', () => {
    expect(linkPath('https://vm-report.example//evil.example/x')).toBe('/evil.example/x');
  });

  test('is null for anything that is not a usable link', () => {
    expect(linkPath(undefined)).toBeNull();
    expect(linkPath('')).toBeNull();
    expect(linkPath(42)).toBeNull();
    expect(linkPath('mailto:someone@example.com')).toBeNull();
    expect(linkPath('javascript:alert(1)')).toBeNull();
  });
});

describe('notificationPath', () => {
  test('a notification shown by FCM: its payload is under FCM_MSG, link in fcmOptions', () => {
    expect(notificationPath({ FCM_MSG: { fcmOptions: { link: LINK }, data: { link: LINK } } })).toBe('/r/rep1/z/women-image');
  });

  test('FCM payload where the link arrived as notification.click_action', () => {
    expect(notificationPath({ FCM_MSG: { notification: { title: 'VM Photo Report', click_action: LINK } } })).toBe('/r/rep1/z/women-image');
  });

  test('FCM payload with only data.link', () => {
    expect(notificationPath({ FCM_MSG: { data: { link: LINK } } })).toBe('/r/rep1/z/women-image');
  });

  test('any other notification with data.link', () => {
    expect(notificationPath({ link: LINK })).toBe('/r/rep1/z/women-image');
  });

  test('is null for a notification without a link', () => {
    expect(notificationPath(undefined)).toBeNull();
    expect(notificationPath(null)).toBeNull();
    expect(notificationPath({})).toBeNull();
    expect(notificationPath({ FCM_MSG: { notification: { title: 'x' } } })).toBeNull();
  });
});
