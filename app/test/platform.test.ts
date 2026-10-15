import { describe, expect, test } from 'vitest';
import { detectPlatform, iosVersion, mustShowEveryPush, pushSupported } from '../src/push/platform';

const IPHONE_17_4 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_16_3 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
/** iPadOS Safari asks for desktop sites, so it looks like a Mac; only the touch screen tells them apart. */
const IPAD_OR_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const DESKTOP_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

describe('detectPlatform', () => {
  test('iPhone in Safari is ios-browser', () => {
    expect(detectPlatform(IPHONE_17_4, 5, false)).toBe('ios-browser');
  });

  test('iPhone opened from the Home Screen is ios-standalone', () => {
    expect(detectPlatform(IPHONE_17_4, 5, true)).toBe('ios-standalone');
  });

  test('an iPad that reports Macintosh but has a touch screen is ios-browser', () => {
    expect(detectPlatform(IPAD_OR_MAC, 5, false)).toBe('ios-browser');
  });

  test('a real Mac (no touch points) is other', () => {
    expect(detectPlatform(IPAD_OR_MAC, 0, false)).toBe('other');
  });

  test('Android Chrome is android, in the browser and installed', () => {
    expect(detectPlatform(ANDROID_CHROME, 5, false)).toBe('android');
    expect(detectPlatform(ANDROID_CHROME, 5, true)).toBe('android');
  });

  test('desktop Chrome is other', () => {
    expect(detectPlatform(DESKTOP_CHROME, 0, false)).toBe('other');
  });
});

describe('iosVersion', () => {
  test('reads major and minor from "OS x_y"', () => {
    expect(iosVersion('Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15')).toBe(16.3);
    expect(iosVersion(IPHONE_17_4)).toBe(17.4);
  });

  test('ignores the patch number', () => {
    expect(iosVersion('Mozilla/5.0 (iPhone; CPU iPhone OS 16_4_1 like Mac OS X) AppleWebKit/605.1.15')).toBe(16.4);
  });

  test('reads an iPad "CPU OS" string', () => {
    expect(iosVersion('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15')).toBe(17);
  });

  test('is null where the UA has no iOS version', () => {
    expect(iosVersion(IPAD_OR_MAC)).toBeNull();
    expect(iosVersion(ANDROID_CHROME)).toBeNull();
    expect(iosVersion(DESKTOP_CHROME)).toBeNull();
  });
});

describe('pushSupported', () => {
  test('the Home Screen app needs iOS 16.4 or later', () => {
    expect(pushSupported('ios-standalone', iosVersion(IPHONE_16_3), true)).toBe(false);
    expect(pushSupported('ios-standalone', 16.3, true)).toBe(false);
    expect(pushSupported('ios-standalone', 16.4, true)).toBe(true);
    expect(pushSupported('ios-standalone', 17.4, true)).toBe(true);
  });

  test('an iPad Home Screen app (no version in its UA) goes by the Notification API alone', () => {
    expect(pushSupported('ios-standalone', null, true)).toBe(true);
    expect(pushSupported('ios-standalone', null, false)).toBe(false);
  });

  test('Safari tabs on iPhone/iPad never get push', () => {
    expect(pushSupported('ios-browser', 17.4, true)).toBe(false);
  });

  test('desktop Chrome is other and supported', () => {
    expect(detectPlatform(DESKTOP_CHROME, 0, false)).toBe('other');
    expect(pushSupported('other', iosVersion(DESKTOP_CHROME), true)).toBe(true);
  });

  test('Android and others need the Notification API', () => {
    expect(pushSupported('android', null, true)).toBe(true);
    expect(pushSupported('android', null, false)).toBe(false);
    expect(pushSupported('other', null, false)).toBe(false);
  });
});

describe('mustShowEveryPush', () => {
  const IPHONE_HOME_SCREEN = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
  const DESKTOP_FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';

  test('Safari/WebKit (iPhone, iPad, Mac) allows no silent push', () => {
    expect(mustShowEveryPush(IPHONE_17_4)).toBe(true);
    expect(mustShowEveryPush(IPHONE_HOME_SCREEN)).toBe(true);
    expect(mustShowEveryPush(IPAD_OR_MAC)).toBe(true);
  });

  test('Chrome (Android, desktop, Mac) and Firefox do not need it', () => {
    expect(mustShowEveryPush(ANDROID_CHROME)).toBe(false);
    expect(mustShowEveryPush(DESKTOP_CHROME)).toBe(false);
    expect(mustShowEveryPush(MAC_CHROME)).toBe(false);
    expect(mustShowEveryPush(DESKTOP_FIREFOX)).toBe(false);
  });
});
