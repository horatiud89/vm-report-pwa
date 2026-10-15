import type { CSSProperties } from 'react';
import { stateLabel } from '@shared/i18n';
import type { ZoneState } from '@shared/types';
import { useT } from '../i18n/I18nProvider';

type BadgeState = ZoneState | 'overdue';

const OUTLINE: CSSProperties = { backgroundColor: '#ffffff', color: '#000000', borderColor: '#000000' };
const filled = (backgroundColor: string, color: string): CSSProperties => ({ backgroundColor, color, borderColor: backgroundColor });

/** The only colour in the app (spec §6); every other screen stays black, white and grey. */
const BADGE_STYLE: Record<BadgeState, CSSProperties> = {
  empty: filled('#d9d9d9', '#000000'),
  photo_added: OUTLINE,
  submitted: OUTLINE,
  not_in_campaign: filled('#8c8c8c', '#000000'),
  needs_correction: filled('#d32f2f', '#ffffff'),
  overdue: filled('#8e0000', '#ffffff'),
  correction_sent: filled('#ef6c00', '#000000'),
  approved: filled('#2e7d32', '#ffffff'),
};

export function StatusBadge({ state }: { state: BadgeState }) {
  const { lang } = useT();
  return <span className="badge" style={BADGE_STYLE[state]}>{stateLabel(lang, state)}</span>;
}
