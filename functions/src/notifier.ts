import type { Country } from '@shared/types';

export interface ReportRef { id: string; storeId: string; storeCode: string; storeName: string; country: Country; campaignName: string }
export type PushEvent =
  | { kind: 'report_sent'; report: ReportRef }
  | { kind: 'feedback'; report: ReportRef; zoneId: string; zoneName: string; deadline: string }
  | { kind: 'correction_sent'; report: ReportRef; zoneId: string; zoneName: string }
  | { kind: 'zone_approved'; report: ReportRef; zoneId: string; zoneName: string }
  | { kind: 'all_approved'; report: ReportRef; count: number }
  | { kind: 'reminder_day_before' | 'reminder_overdue'; report: ReportRef; zoneId: string; zoneName: string; deadline: string };
export interface Notifier { notify(e: PushEvent): Promise<void> }
