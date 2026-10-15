import { httpsCallable } from 'firebase/functions';
import type { PhotoRef, Stroke } from '@shared/types';
import { functions } from './firebase';

/** Typed wrapper around one callable; the names and shapes are those of functions/src/index.ts. */
function callable<Req, Res = void>(name: string): (data: Req) => Promise<Res> {
  const call = httpsCallable<Req, Res>(functions, name);
  return async (data) => (await call(data)).data;
}

export const createDraft = callable<{ campaignName: string }, { reportId: string }>('createDraft');

export const updateDraftZone = callable<{
  reportId: string;
  zoneId: string;
  photos: PhotoRef[];
  storeComment: string;
  notInCampaign: boolean;
}>('updateDraftZone');

export const sendReport = callable<{ reportId: string }>('sendReport');

export const markSeen = callable<{ reportId: string }>('markSeen');

export const giveFeedback = callable<{
  reportId: string;
  zoneId: string;
  version: number;
  photoIndex: number;
  comment: string;
  strokes: Stroke[];
  deadline: string;
}, { feedbackId: string }>('giveFeedback');

export const sendCorrection = callable<{
  reportId: string;
  zoneId: string;
  photos: PhotoRef[];
  storeComment: string;
}>('sendCorrection');

export const approveZone = callable<{ reportId: string; zoneId: string }>('approveZone');

export const approveAllWithoutFeedback = callable<{ reportId: string }, { approved: number }>('approveAllWithoutFeedback');
