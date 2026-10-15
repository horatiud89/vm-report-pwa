/** A photo whose upload failed after the store had left its zone: the photo the store took is not in the zone. */
export interface LostUpload { reportId: string; zoneId: string; zoneName: string }

type Listener = (lost: LostUpload) => void;

// Kept apart from zoneSession.ts so the layout can listen without loading the upload and API code.
const listeners = new Set<Listener>();

/** Tells `listener` about every lost upload (the layout toasts it wherever the user is). Returns the unsubscribe. */
export function onLostUpload(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function reportLostUpload(lost: LostUpload): void {
  for (const listener of [...listeners]) listener(lost);
}
