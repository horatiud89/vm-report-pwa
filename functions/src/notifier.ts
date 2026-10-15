import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import * as logger from 'firebase-functions/logger';
import { formatDayMonth } from '@shared/dates';
import { LANGS, t, type MsgKey } from '@shared/i18n';
import type { Country, Lang, UserDoc } from '@shared/types';

export interface ReportRef { id: string; storeId: string; storeCode: string; storeName: string; country: Country; campaignName: string }
export type PushEvent =
  | { kind: 'report_sent'; report: ReportRef }
  | { kind: 'feedback'; report: ReportRef; zoneId: string; zoneName: string; deadline: string }
  | { kind: 'correction_sent'; report: ReportRef; zoneId: string; zoneName: string }
  | { kind: 'zone_approved'; report: ReportRef; zoneId: string; zoneName: string }
  | { kind: 'all_approved'; report: ReportRef; count: number }
  | { kind: 'reminder_day_before' | 'reminder_overdue'; report: ReportRef; zoneId: string; zoneName: string; deadline: string };
export interface Notifier { notify(e: PushEvent): Promise<void> }

export const PUSH_TITLE = 'VM Photo Report';

/** FCM accepts at most 500 tokens per multicast. */
const MAX_TOKENS_PER_SEND = 500;
/** Error codes that mean the token will never work again. Anything else (quota, outage) may pass. */
const DEAD_TOKEN_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

const TEXT_KEY: Record<PushEvent['kind'], MsgKey> = {
  report_sent: 'push.reportSent',
  feedback: 'push.feedback',
  correction_sent: 'push.correctionSent',
  zone_approved: 'push.zoneApproved',
  all_approved: 'push.allApproved',
  reminder_day_before: 'push.reminderDayBefore',
  reminder_overdue: 'push.reminderOverdue',
};

/** Who is told: reviewers hear about what the store sends, the store about what reviewers (and the clock) do. */
export function audience(e: PushEvent): 'reviewers' | 'store' {
  switch (e.kind) {
    case 'report_sent':
    case 'correction_sent':
      return 'reviewers';
    case 'feedback':
    case 'zone_approved':
    case 'all_approved':
    case 'reminder_day_before':
    case 'reminder_overdue':
      return 'store';
  }
}

export function buildMessage(e: PushEvent, lang: Lang, appUrl: string): { title: string; body: string; link: string } {
  const params: Record<string, string | number> = {
    store: `${e.report.storeCode} ${e.report.storeName}`,
    campaign: e.report.campaignName,
  };
  if ('zoneName' in e) params.zone = e.zoneName;
  if ('deadline' in e) params.date = formatDayMonth(e.deadline);
  if (e.kind === 'all_approved') params.n = e.count;

  const reportLink = `${appUrl.replace(/\/+$/, '')}/r/${e.report.id}`;
  return {
    title: PUSH_TITLE,
    body: t(lang, TEXT_KEY[e.kind], params),
    link: 'zoneId' in e ? `${reportLink}/z/${e.zoneId}` : reportLink,
  };
}

/** Only what FcmNotifier uses of the SDK, so tests can hand it small fakes. */
type UsersDb = Pick<Firestore, 'collection' | 'doc'>;
type Sender = Pick<Messaging, 'sendEachForMulticast'>;

interface TokenEntry { lang: Lang; uids: string[] }

const languageOf = (u: Partial<UserDoc>): Lang => (LANGS.includes(u.language as Lang) ? (u.language as Lang) : 'en');

export class FcmNotifier implements Notifier {
  constructor(private readonly db: UsersDb, private readonly messaging: Sender, private readonly appUrl: string) {}

  /** A failed push must never fail the action that caused it: everything is logged and swallowed. */
  async notify(e: PushEvent): Promise<void> {
    try {
      const tokens = await this.tokensFor(e);
      const byLang = new Map<Lang, string[]>();
      for (const [token, { lang }] of tokens) {
        const group = byLang.get(lang);
        if (group) group.push(token);
        else byLang.set(lang, [token]);
      }
      for (const [lang, langTokens] of byLang) {
        const message = buildMessage(e, lang, this.appUrl);
        for (let i = 0; i < langTokens.length; i += MAX_TOKENS_PER_SEND) {
          await this.send(langTokens.slice(i, i + MAX_TOKENS_PER_SEND), message, tokens, e.kind);
        }
      }
    } catch (err) {
      logger.error(`push '${e.kind}' failed`, err);
    }
  }

  /** Every token of the audience, once, with its language and the users whose document holds it. */
  private async tokensFor(e: PushEvent): Promise<Map<string, TokenEntry>> {
    const users = this.db.collection('users');
    const snaps = audience(e) === 'store'
      ? [await users.where('storeId', '==', e.report.storeId).get()]
      : await Promise.all([
        users.where('role', 'in', ['head_vm', 'director']).get(),
        users.where('role', 'in', ['avm', 'am']).where('country', '==', e.report.country).get(),
      ]);

    const tokens = new Map<string, TokenEntry>();
    for (const doc of new Map(snaps.flatMap((s) => s.docs).map((doc) => [doc.id, doc])).values()) {
      const user = doc.data() as Partial<UserDoc>;
      if (!Array.isArray(user.fcmTokens)) continue;
      for (const token of user.fcmTokens) {
        const entry = tokens.get(token);
        if (entry) entry.uids.push(doc.id);
        else tokens.set(token, { lang: languageOf(user), uids: [doc.id] });
      }
    }
    return tokens;
  }

  private async send(
    chunk: string[], message: { title: string; body: string; link: string }, owners: Map<string, TokenEntry>, kind: PushEvent['kind'],
  ): Promise<void> {
    try {
      const { responses } = await this.messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title: message.title, body: message.body },
        webpush: { fcmOptions: { link: message.link } },
        data: { link: message.link },
      });
      const dead = chunk.filter((_, i) => {
        const code = responses[i]?.error?.code;
        return responses[i]?.success === false && code !== undefined && DEAD_TOKEN_CODES.has(code);
      });
      await Promise.all(dead.flatMap((token) => owners.get(token)?.uids.map((uid) => this.forget(uid, token)) ?? []));
    } catch (err) {
      logger.error(`push '${kind}' could not be sent to ${chunk.length} devices`, err);
    }
  }

  private async forget(uid: string, token: string): Promise<void> {
    try {
      await this.db.doc(`users/${uid}`).update({ fcmTokens: FieldValue.arrayRemove(token) });
    } catch (err) {
      logger.error(`could not remove a dead push token from users/${uid}`, err);
    }
  }
}

/** Used in the emulator, where there is no FCM: shows what would have been sent. */
export class LogNotifier implements Notifier {
  async notify(e: PushEvent): Promise<void> {
    logger.info(`push '${e.kind}' (emulator, not sent)`, e);
  }
}
