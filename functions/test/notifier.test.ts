import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import { error as logError } from 'firebase-functions/logger';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { UserDoc } from '@shared/types';
import { FcmNotifier, audience, buildMessage, type PushEvent, type ReportRef } from '../src/notifier';

vi.mock('firebase-functions/logger');

const APP_URL = 'https://x.web.app';
const REPORT: ReportRef = { id: 'r1', storeId: '850', storeCode: '850', storeName: 'Palladium Praha', country: 'CZ', campaignName: 'Autumn 2026' };

const reportSent: PushEvent = { kind: 'report_sent', report: REPORT };
const feedback: PushEvent = { kind: 'feedback', report: REPORT, zoneId: 'women-wall-1', zoneName: "Women's Wall 1", deadline: '2026-10-16' };
const correctionSent: PushEvent = { kind: 'correction_sent', report: REPORT, zoneId: 'women-wall-1', zoneName: "Women's Wall 1" };
const zoneApproved: PushEvent = { kind: 'zone_approved', report: REPORT, zoneId: 'women-wall-1', zoneName: "Women's Wall 1" };
const allApproved: PushEvent = { kind: 'all_approved', report: REPORT, count: 32 };
const dayBefore: PushEvent = { kind: 'reminder_day_before', report: REPORT, zoneId: 'women-wall-1', zoneName: "Women's Wall 1", deadline: '2026-10-16' };
const overdue: PushEvent = { kind: 'reminder_overdue', report: REPORT, zoneId: 'women-wall-1', zoneName: "Women's Wall 1", deadline: '2026-10-16' };

describe('audience', () => {
  test.each([
    [reportSent, 'reviewers'],
    [correctionSent, 'reviewers'],
    [feedback, 'store'],
    [zoneApproved, 'store'],
    [allApproved, 'store'],
    [dayBefore, 'store'],
    [overdue, 'store'],
  ] as const)('%j goes to %s', (event, expected) => {
    expect(audience(event)).toBe(expected);
  });
});

describe('buildMessage', () => {
  test('feedback links to the zone and names the zone and deadline', () => {
    expect(buildMessage(feedback, 'en', APP_URL)).toEqual({
      title: 'VM Photo Report',
      body: "Feedback: Women's Wall 1 — deadline 16.10",
      link: 'https://x.web.app/r/r1/z/women-wall-1',
    });
  });

  test('report_sent names the store with its code and links to the report', () => {
    expect(buildMessage(reportSent, 'en', APP_URL)).toEqual({
      title: 'VM Photo Report',
      body: '850 Palladium Praha sent a report: Autumn 2026',
      link: 'https://x.web.app/r/r1',
    });
  });

  test('all_approved links to the report and counts the zones', () => {
    expect(buildMessage(allApproved, 'en', APP_URL)).toMatchObject({
      body: 'Autumn 2026: 32 zones approved',
      link: 'https://x.web.app/r/r1',
    });
  });

  test('every other kind links to its zone', () => {
    for (const event of [correctionSent, zoneApproved, dayBefore, overdue]) {
      expect(buildMessage(event, 'en', APP_URL).link).toBe('https://x.web.app/r/r1/z/women-wall-1');
    }
  });

  test('each kind uses its own text', () => {
    expect(buildMessage(correctionSent, 'en', APP_URL).body).toBe("850 Palladium Praha sent a correction: Women's Wall 1");
    expect(buildMessage(zoneApproved, 'en', APP_URL).body).toBe("Approved: Women's Wall 1");
    expect(buildMessage(dayBefore, 'en', APP_URL).body).toBe("Reminder: Women's Wall 1 — deadline tomorrow (16.10)");
    expect(buildMessage(overdue, 'en', APP_URL).body).toBe("Overdue: Women's Wall 1 — deadline was 16.10");
  });

  test('the text follows the language, the title and the zone name do not', () => {
    const cs = buildMessage(feedback, 'cs', APP_URL);
    expect(cs.title).toBe('VM Photo Report');
    expect(cs.body).toContain("Women's Wall 1");
    expect(cs.body).not.toBe(buildMessage(feedback, 'en', APP_URL).body);
    expect(buildMessage(feedback, 'ro', APP_URL).body).not.toBe(cs.body);
  });

  test('a trailing slash on the app URL does not double up', () => {
    expect(buildMessage(reportSent, 'en', `${APP_URL}/`).link).toBe('https://x.web.app/r/r1');
  });
});

// --- FcmNotifier with a fake Firestore users collection and a fake Messaging -------------------------------------------

type Where = [field: keyof UserDoc, op: '==' | 'in', value: unknown];
type Multicast = { tokens: string[]; notification: { title: string; body: string }; webpush: { fcmOptions: { link: string } }; data: { link: string } };

/** Just enough of a users collection: chained where() with '==' and 'in', get(), and update() on a user document. */
class FakeDb {
  readonly updates: { path: string; data: Record<string, unknown> }[] = [];
  constructor(private readonly users: Record<string, Partial<UserDoc>>) {}

  collection(name: string) {
    if (name !== 'users') throw new Error(`unexpected collection ${name}`);
    const query = (filters: Where[]) => ({
      where: (field: Where[0], op: Where[1], value: unknown) => query([...filters, [field, op, value]]),
      get: async () => ({
        docs: Object.entries(this.users)
          .filter(([, u]) => filters.every(([f, op, v]) => (op === '==' ? u[f] === v : (v as unknown[]).includes(u[f]))))
          .map(([id, u]) => ({ id, data: () => u })),
      }),
    });
    return query([]);
  }

  doc(path: string) {
    return { update: async (data: Record<string, unknown>) => { this.updates.push({ path, data }); } };
  }
}

class FakeMessaging {
  readonly calls: Multicast[] = [];
  /** token -> error code; a rejected promise instead of a response when `rejectWith` is set. */
  readonly failures = new Map<string, string>();
  rejectWith: Error | null = null;

  async sendEachForMulticast(message: Multicast) {
    this.calls.push(message);
    if (this.rejectWith) throw this.rejectWith;
    const responses = message.tokens.map((token) => {
      const code = this.failures.get(token);
      return code ? { success: false, error: { code } } : { success: true, messageId: `m-${token}` };
    });
    const failureCount = responses.filter((r) => !r.success).length;
    return { responses, failureCount, successCount: responses.length - failureCount };
  }
}

const user = (role: UserDoc['role'], country: UserDoc['country'], storeId: string | null, language: string | undefined, fcmTokens: string[]) => (
  { role, country, storeId, language, fcmTokens } as Partial<UserDoc>
);

const USERS = {
  'u-avm-cz': user('avm', 'CZ', null, 'cs', ['avm-cz-1', 'avm-cz-dead']),
  'u-director': user('director', null, null, 'en', ['director-1']),
  'u-head': user('head_vm', null, null, 'ro', []),
  'u-am-cz': user('am', 'CZ', null, 'xx', ['am-cz-1']),
  'u-avm-sk': user('avm', 'SK', null, 'sk', ['avm-sk-1']),
  'u-store-850': user('store', 'CZ', '850', 'cs', ['store-1', 'store-2']),
  'u-store-851': user('store', 'CZ', '851', 'cs', ['other-store-1']),
};

function setup(users: Record<string, Partial<UserDoc>> = USERS) {
  const db = new FakeDb(users);
  const messaging = new FakeMessaging();
  const notifier = new FcmNotifier(db as unknown as Firestore, messaging as unknown as Messaging, APP_URL);
  return { db, messaging, notifier };
}

const sortedTokens = (m: Multicast) => [...m.tokens].sort();

beforeEach(() => {
  vi.mocked(logError).mockClear();
});

describe('FcmNotifier', () => {
  test('reviewers of the country and head/director get the push once per language, other countries and stores do not', async () => {
    const { messaging, notifier } = setup();
    await notifier.notify(reportSent);

    expect(messaging.calls).toHaveLength(2);
    const cs = messaging.calls.find((m) => m.notification.body === buildMessage(reportSent, 'cs', APP_URL).body);
    const en = messaging.calls.find((m) => m.notification.body === buildMessage(reportSent, 'en', APP_URL).body);
    expect(cs && sortedTokens(cs)).toEqual(['avm-cz-1', 'avm-cz-dead']);
    // The director's English and the area manager's unknown language ('xx') share one English call; the head of VM has no tokens.
    expect(en && sortedTokens(en)).toEqual(['am-cz-1', 'director-1']);
    const all = messaging.calls.flatMap((m) => m.tokens);
    expect(all).not.toContain('avm-sk-1');
    expect(all).not.toContain('store-1');
  });

  test('sends the title, body and link as a notification, a web push link and data', async () => {
    const { messaging, notifier } = setup();
    await notifier.notify(reportSent);

    const cs = buildMessage(reportSent, 'cs', APP_URL);
    expect(messaging.calls.find((m) => m.tokens.includes('avm-cz-1'))).toEqual({
      tokens: ['avm-cz-1', 'avm-cz-dead'],
      notification: { title: cs.title, body: cs.body },
      webpush: { fcmOptions: { link: cs.link } },
      data: { link: cs.link },
    });
  });

  test('a store event goes to the report store only, in the store users language', async () => {
    const { messaging, notifier } = setup();
    await notifier.notify(feedback);

    const message = buildMessage(feedback, 'cs', APP_URL);
    expect(messaging.calls).toEqual([{
      tokens: ['store-1', 'store-2'],
      notification: { title: message.title, body: message.body },
      webpush: { fcmOptions: { link: 'https://x.web.app/r/r1/z/women-wall-1' } },
      data: { link: 'https://x.web.app/r/r1/z/women-wall-1' },
    }]);
  });

  test('removes only tokens that Firebase reports as unregistered or invalid, from the user that owns them', async () => {
    const { db, messaging, notifier } = setup();
    messaging.failures.set('avm-cz-dead', 'messaging/registration-token-not-registered');
    messaging.failures.set('director-1', 'messaging/invalid-registration-token');
    messaging.failures.set('am-cz-1', 'messaging/internal-error');
    await notifier.notify(reportSent);

    expect(db.updates).toHaveLength(2);
    const removed = (path: string) => db.updates.find((u) => u.path === path)?.data;
    expect((removed('users/u-avm-cz')?.fcmTokens as FieldValue).isEqual(FieldValue.arrayRemove('avm-cz-dead'))).toBe(true);
    expect((removed('users/u-director')?.fcmTokens as FieldValue).isEqual(FieldValue.arrayRemove('director-1'))).toBe(true);
    expect(removed('users/u-am-cz')).toBeUndefined();
  });

  test('a token shared by two users is sent once and removed from both', async () => {
    const { db, messaging, notifier } = setup({
      'u-a': user('store', 'CZ', '850', 'en', ['shared', 'a-only']),
      'u-b': user('store', 'CZ', '850', 'en', ['shared']),
    });
    messaging.failures.set('shared', 'messaging/registration-token-not-registered');
    await notifier.notify(feedback);

    expect(messaging.calls).toHaveLength(1);
    expect(sortedTokens(messaging.calls[0]!)).toEqual(['a-only', 'shared']);
    expect(db.updates.map((u) => u.path).sort()).toEqual(['users/u-a', 'users/u-b']);
  });

  test('sends at most 500 tokens per call', async () => {
    const tokens = Array.from({ length: 1200 }, (_, i) => `t-${i}`);
    const { messaging, notifier } = setup({ 'u-store': user('store', 'CZ', '850', 'en', tokens) });
    await notifier.notify(feedback);

    expect(messaging.calls.map((m) => m.tokens.length)).toEqual([500, 500, 200]);
    expect(messaging.calls.flatMap((m) => m.tokens)).toEqual(tokens);
  });

  test('sends nothing when nobody has a token', async () => {
    const { messaging, notifier } = setup({ 'u-store': user('store', 'CZ', '850', 'en', []), 'u-bare': { role: 'store', storeId: '850' } });
    await notifier.notify(feedback);
    expect(messaging.calls).toHaveLength(0);
  });

  test('resolves and logs when the messaging service rejects, and keeps going with the next language', async () => {
    const { db, messaging, notifier } = setup();
    messaging.rejectWith = new Error('fcm down');
    await expect(notifier.notify(reportSent)).resolves.toBeUndefined();

    expect(messaging.calls).toHaveLength(2);
    expect(logError).toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
  });

  test('resolves and logs when the users query fails', async () => {
    const { db, messaging, notifier } = setup();
    db.collection = () => { throw new Error('firestore down'); };
    await expect(notifier.notify(feedback)).resolves.toBeUndefined();

    expect(messaging.calls).toHaveLength(0);
    expect(logError).toHaveBeenCalled();
  });

  test('resolves when removing a dead token fails', async () => {
    const { db, messaging, notifier } = setup();
    messaging.failures.set('store-1', 'messaging/registration-token-not-registered');
    db.doc = () => ({ update: async () => { throw new Error('user deleted'); } });
    await expect(notifier.notify(feedback)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalled();
  });
});
