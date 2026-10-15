import { allZones, STORE_850 } from '@shared/store850';
import type { PhotoRef, ReportDoc, ZoneDoc, ZoneState } from '@shared/types';
import type { Live } from '../src/data/hooks';

export const live = <T,>(data: T): Live<T> => ({ data, loading: false, error: null });

export function makeReport(over: Partial<ReportDoc> = {}): ReportDoc {
  return {
    id: 'r1', storeId: '850', storeCode: '850', storeName: 'Palladium Praha', country: 'CZ', timezone: 'Europe/Prague',
    campaignName: 'Autumn 2026', status: 'draft', createdAt: Date.UTC(2026, 9, 14, 8), sentAt: null, seenBy: [], zoneSummary: {},
    ...over,
  };
}

export const photo = (n: number, zoneId = 'women-image'): PhotoRef => ({
  path: `reports/CZ/850/r1/${zoneId}/v1_${n}.jpg`, width: 1440, height: 1920,
});

export function makeZone(id: string, over: Partial<ZoneDoc> = {}): ZoneDoc {
  const def = allZones(STORE_850).find((z) => z.id === id);
  if (!def) throw new Error(`unknown zone ${id}`);
  return {
    id, reportId: 'r1', storeId: '850', country: 'CZ', departmentId: def.departmentId, name: def.name, order: def.order,
    state: 'empty', versions: [{ n: 1, photos: [], storeComment: '', createdAt: 1 }], earliestOpenDeadline: null,
    reminderDayBeforeSentFor: null, reminderOverdueSentFor: null, approvedBy: null, approvedAt: null,
    ...over,
  };
}

/** All 33 zones of store 850; `states` overrides the state of single zones, every other zone gets `rest`. */
export function allZoneDocs(rest: ZoneState = 'empty', states: Record<string, ZoneState> = {}): ZoneDoc[] {
  return allZones(STORE_850).map((z) => makeZone(z.id, { state: states[z.id] ?? rest }));
}

/** A photo of a given version of a zone. */
export const versionPhoto = (n: number, version: number, zoneId = 'women-image'): PhotoRef => ({
  path: `reports/CZ/850/r1/${zoneId}/v${version}_${n}.jpg`, width: 1440, height: 1920,
});
