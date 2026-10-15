import { stateLabel } from '@shared/i18n';
import { useT } from '../i18n/I18nProvider';
import { BADGE_STYLE } from './badgeStyle';
import type { BadgeState } from './badgeStyle';

export function StatusBadge({ state }: { state: BadgeState }) {
  const { lang } = useT();
  return <span className="badge" style={BADGE_STYLE[state]}>{stateLabel(lang, state)}</span>;
}
