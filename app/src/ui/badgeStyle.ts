import type { CSSProperties } from 'react';
import type { ZoneState } from '@shared/types';

export type BadgeState = ZoneState | 'overdue';

const OUTLINE: CSSProperties = { backgroundColor: '#ffffff', color: '#000000', borderColor: '#000000' };
const filled = (backgroundColor: string, color: string): CSSProperties => ({ backgroundColor, color, borderColor: backgroundColor });

/** The only colour in the app (spec §6); every other screen stays black, white and grey. Shared by badges and the overview grid. */
export const BADGE_STYLE: Record<BadgeState, CSSProperties> = {
  empty: filled('#d9d9d9', '#000000'),
  photo_added: OUTLINE,
  submitted: OUTLINE,
  not_in_campaign: filled('#8c8c8c', '#000000'),
  needs_correction: filled('#d32f2f', '#ffffff'),
  overdue: filled('#8e0000', '#ffffff'),
  correction_sent: filled('#ef6c00', '#000000'),
  approved: filled('#2e7d32', '#ffffff'),
};
