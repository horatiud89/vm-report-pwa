import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { ZoneDoc, ZoneSummary } from '@shared/types';

type ZoneStatus = Pick<ZoneDoc, 'id' | 'state' | 'earliestOpenDeadline'>;

export function summarize(zones: Iterable<ZoneStatus>): Record<string, ZoneSummary> {
  const summary: Record<string, ZoneSummary> = {};
  for (const z of zones) summary[z.id] = { state: z.state, deadline: z.earliestOpenDeadline };
  return summary;
}

/**
 * Builds the report's zoneSummary. Firestore transactions allow no read after a write, so call this BEFORE writing
 * the changed zone(s) and pass the values about to be written as `changed` (keyed by zone id); they replace the
 * stored ones in memory. The caller then writes the returned map to the report in the same transaction.
 */
export async function recomputeSummary(
  tx: Transaction,
  db: Firestore,
  reportId: string,
  changed: Record<string, Pick<ZoneDoc, 'state' | 'earliestOpenDeadline'>> = {},
): Promise<Record<string, ZoneSummary>> {
  const snap = await tx.get(db.collection(`reports/${reportId}/zones`));
  return summarize(snap.docs.map((s) => {
    const zone = s.data() as ZoneDoc;
    return { id: zone.id, ...(changed[zone.id] ?? zone) };
  }));
}
