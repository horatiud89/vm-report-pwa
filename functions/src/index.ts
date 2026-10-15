import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { onCall } from 'firebase-functions/https';
import { setGlobalOptions } from 'firebase-functions/options';
import { defineString } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/scheduler';
import { callerFrom } from './caller';
import type { Deps } from './deps';
import * as draft from './draft';
import { FcmNotifier, LogNotifier } from './notifier';
import { runReminders } from './reminders';
import * as review from './review';

setGlobalOptions({ region: 'europe-west3' });
initializeApp();

/** Public URL of the web app (https://<project>.web.app), the target of every push link. Set per project at deploy. */
const APP_URL = defineString('APP_URL');

/** Built per invocation: a parameter's value is not available while the module loads. */
function deps(): Deps {
  const db = getFirestore();
  // The emulator has no FCM: log what would be sent instead.
  const notifier = process.env.FUNCTIONS_EMULATOR === 'true' ? new LogNotifier() : new FcmNotifier(db, getMessaging(), APP_URL.value());
  return { db, bucket: getStorage().bucket(), notifier, now: () => Date.now() };
}

export const createDraft = onCall((req) => draft.createDraft(callerFrom(req.auth), req.data, deps()));
export const updateDraftZone = onCall((req) => draft.updateDraftZone(callerFrom(req.auth), req.data, deps()));
export const sendReport = onCall((req) => draft.sendReport(callerFrom(req.auth), req.data, deps()));
export const markSeen = onCall((req) => draft.markSeen(callerFrom(req.auth), req.data, deps()));
export const giveFeedback = onCall((req) => review.giveFeedback(callerFrom(req.auth), req.data, deps()));
export const sendCorrection = onCall((req) => review.sendCorrection(callerFrom(req.auth), req.data, deps()));
export const approveZone = onCall((req) => review.approveZone(callerFrom(req.auth), req.data, deps()));
export const approveAllWithoutFeedback = onCall((req) => review.approveAllWithoutFeedback(callerFrom(req.auth), req.data, deps()));

export const reminders = onSchedule(
  { schedule: 'every 1 hours', timeZone: 'Europe/Prague' },
  async () => { await runReminders(deps()); },
);
