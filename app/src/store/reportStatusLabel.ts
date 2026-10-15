import { openCorrections, reportStatus } from '@shared/status';
import type { ReportDoc } from '@shared/types';
import type { I18n } from '../i18n/I18nProvider';

/** Draft, Sent, Corrections open (n) or Approved, in the user's language. */
export function reportStatusLabel(t: I18n['t'], report: ReportDoc): string {
  return t(`report.${reportStatus(report.status, report.zoneSummary)}`, { n: openCorrections(report.zoneSummary) });
}
