import type { ZoneState, ZoneSummary } from './types';

export const MAX_PHOTOS = 3;

export type ZoneAction = 'send' | 'feedback' | 'correction' | 'approve';
export type ReportStatus = 'draft' | 'sent' | 'corrections_open' | 'approved';

const ZONE_STATES: readonly ZoneState[] = [
  'empty', 'photo_added', 'not_in_campaign', 'submitted', 'needs_correction', 'correction_sent', 'approved',
];

const TRANSITIONS: Record<ZoneAction, Partial<Record<ZoneState, ZoneState>>> = {
  send: { photo_added: 'submitted', not_in_campaign: 'not_in_campaign' },
  feedback: {
    submitted: 'needs_correction',
    needs_correction: 'needs_correction',
    correction_sent: 'needs_correction',
    approved: 'needs_correction',
  },
  correction: { needs_correction: 'correction_sent' },
  approve: { submitted: 'approved', correction_sent: 'approved' },
};

export class TransitionError extends Error {
  override readonly name = 'TransitionError';

  constructor(readonly state: ZoneState, readonly action: ZoneAction) {
    super(`cannot apply '${action}' to zone in state '${state}'`);
  }
}

/** State of a zone while the store is still drafting the report. */
export function draftState(photoCount: number, notInCampaign: boolean): ZoneState {
  if (!Number.isInteger(photoCount) || photoCount < 0) {
    throw new Error(`invalid photo count: ${photoCount}`);
  }
  if (photoCount > MAX_PHOTOS) {
    throw new Error(`too many photos: ${photoCount} (max ${MAX_PHOTOS})`);
  }
  if (notInCampaign) {
    if (photoCount > 0) throw new Error('a zone marked not in campaign cannot have photos');
    return 'not_in_campaign';
  }
  return photoCount === 0 ? 'empty' : 'photo_added';
}

export function nextState(state: ZoneState, action: ZoneAction): ZoneState {
  const next = TRANSITIONS[action][state];
  if (next === undefined) throw new TransitionError(state, action);
  return next;
}

export function canSend(states: ZoneState[]): boolean {
  return states.every((s) => s === 'photo_added' || s === 'not_in_campaign')
    && states.some((s) => s === 'photo_added');
}

export function countStates(summary: Record<string, ZoneSummary>): Record<ZoneState, number> {
  const counts = Object.fromEntries(ZONE_STATES.map((s) => [s, 0])) as Record<ZoneState, number>;
  for (const { state } of Object.values(summary)) counts[state] += 1;
  return counts;
}

/** Zones the store still owes a correction for, or whose correction awaits review. */
export function openCorrections(summary: Record<string, ZoneSummary>): number {
  const counts = countStates(summary);
  return counts.needs_correction + counts.correction_sent;
}

export function reportStatus(status: 'draft' | 'sent', summary: Record<string, ZoneSummary>): ReportStatus {
  if (status === 'draft') return 'draft';
  const included = Object.values(summary).filter((z) => z.state !== 'not_in_campaign');
  if (included.every((z) => z.state === 'approved')) return 'approved';
  if (openCorrections(summary) > 0) return 'corrections_open';
  return 'sent';
}
