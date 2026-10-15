import type { PhotoRef, ReportDoc, ZoneDoc } from '@shared/types';
import { updateDraftZone } from '../api';
import { uploadZonePhoto } from '../photos/compress';
import { reportLostUpload } from './lostUploads';

/** A comment is saved this long after the last keystroke (or at once when the field is left). */
export const COMMENT_SAVE_DELAY_MS = 800;

/**
 * A zone left alone this long after everything was saved is read from Firestore again on the next visit (it may
 * have been changed on another device). Within it the session is trusted: the snapshot may not have caught up
 * with the save that just finished.
 */
const SETTLED_TTL_MS = 30_000;

/** What the store has entered for the zone: exactly what updateDraftZone takes. */
export interface Edit { photos: PhotoRef[]; comment: string; notInCampaign: boolean }
export interface Upload { id: number; progress: number }
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** What the zone screen shows. A new object after every change, so it can be used with useSyncExternalStore. */
export interface SessionState {
  edit: Edit;
  uploads: Upload[];
  status: SaveStatus;
  /** Counts failed uploads and saves; the screen that is open toasts when it grows. */
  errors: number;
}

type Listener = () => void;

/**
 * The editing of one zone of a draft: the values entered so far, the uploads under way and the save queue.
 * It outlives the screen: an upload that finishes (or a save that is retried) after the user left the zone still
 * ends in the right place, and coming back attaches to the same session instead of starting again from a
 * Firestore snapshot that does not contain this work yet. Every save sends the session's latest full state,
 * one save at a time, because updateDraftZone replaces the whole zone (last save wins).
 */
export class ZoneSession {
  private edit: Edit;
  private uploads: Upload[] = [];
  private nextUpload = 0;
  /** Counts changes; `savedRev` is the change the last successful save sent. They differ while something is unsaved. */
  private rev = 0;
  private savedRev = 0;
  private running = false;
  private again = false;
  private failed = false;
  private everSaved = false;
  private errors = 0;
  /** An upload failed while no screen showed the zone: the store believes in a photo that is not there. */
  private lost = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private attached = 0;
  private lastActivity = Date.now();
  private readonly listeners = new Set<Listener>();
  private snapshot: SessionState;

  constructor(
    readonly report: ReportDoc,
    readonly zoneId: string,
    readonly zoneName: string,
    private readonly version: number,
    initial: Edit,
  ) {
    this.edit = initial;
    this.snapshot = this.state();
  }

  get key(): string {
    return `${this.report.id}/${this.zoneId}`;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = (): SessionState => this.snapshot;

  /** An upload, a save or a typed comment waiting for its save is under way. */
  get pending(): boolean {
    return this.uploads.length > 0 || this.running || (this.rev !== this.savedRev && !this.failed);
  }

  /** The last save failed and its data is still unsaved; it is sent again by the next change or Try again. */
  get unsaved(): boolean {
    return !this.running && this.failed && this.rev !== this.savedRev;
  }

  /** A photo upload failed after the user had left the zone; the zone being opened again clears it. */
  get lostUpload(): boolean {
    return this.lost;
  }

  /** Nothing to wait for or to send, and nobody looking for a while: a later visit may start from the snapshot. */
  expired(now: number): boolean {
    return this.attached === 0 && !this.pending && !this.unsaved && !this.lost && now - this.lastActivity > SETTLED_TTL_MS;
  }

  /** A screen shows this session; a lost upload is then in front of the user, who can add the photo again. */
  attach(): void {
    this.attached += 1;
    if (sessions.get(this.key) !== this) sessions.set(this.key, this);
    if (this.lost) {
      this.lost = false;
      this.emit();
    }
  }

  /** The screen is gone; what is not saved yet is sent now, and a save that failed is tried once more. */
  detach(): void {
    this.attached -= 1;
    this.lastActivity = Date.now();
    if (this.attached === 0 && this.rev !== this.savedRev) void this.save();
  }

  /** Stops the timer; for tests. */
  dispose(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  async addPhoto(file: File): Promise<void> {
    const id = this.nextUpload++;
    this.uploads = [...this.uploads, { id, progress: 0 }];
    this.emit();
    try {
      const photo = await uploadZonePhoto(this.report, this.zoneId, this.version, file, (progress) => {
        this.uploads = this.uploads.map((u) => (u.id === id ? { ...u, progress } : u));
        this.emit();
      });
      this.uploads = this.uploads.filter((u) => u.id !== id);
      this.change({ photos: [...this.edit.photos, photo] });
      void this.save();
    } catch {
      this.uploads = this.uploads.filter((u) => u.id !== id);
      this.errors += 1;
      this.lastActivity = Date.now();
      // An open zone screen shows the error itself; otherwise the report and a toast must say which zone lost a photo.
      const unseen = this.attached === 0;
      if (unseen) this.lost = true;
      this.emit();
      if (unseen) reportLostUpload({ reportId: this.report.id, zoneId: this.zoneId, zoneName: this.zoneName });
    }
  }

  removePhoto(path: string): void {
    this.change({ photos: this.edit.photos.filter((p) => p.path !== path) });
    void this.save();
  }

  /** Not possible while the zone has photos or uploads (the server rejects it too). */
  setNotInCampaign(notInCampaign: boolean): void {
    if (this.edit.photos.length > 0 || this.uploads.length > 0) return;
    this.change({ notInCampaign });
    void this.save();
  }

  typeComment(comment: string): void {
    this.change({ comment });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.save(), COMMENT_SAVE_DELAY_MS);
    this.emit();
  }

  /** Leaving the comment field saves a typed comment at once instead of waiting. */
  leaveComment(): void {
    if (this.timer !== undefined) void this.save();
  }

  /** Sends the zone as it is now. A request made while a save runs is answered by one more save right after it. */
  async save(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.running) {
      this.again = true;
      this.emit();
      return;
    }
    this.running = true;
    this.failed = false;
    this.emit();
    try {
      do {
        this.again = false;
        const sentRev = this.rev;
        const { photos, comment, notInCampaign } = this.edit;
        await updateDraftZone({ reportId: this.report.id, zoneId: this.zoneId, photos, storeComment: comment, notInCampaign });
        this.savedRev = sentRev;
        this.everSaved = true;
      } while (this.again && this.rev !== this.savedRev);
    } catch {
      this.failed = true;
      this.errors += 1;
    } finally {
      this.running = false;
      this.lastActivity = Date.now();
      this.emit();
    }
  }

  private change(patch: Partial<Edit>): void {
    this.edit = { ...this.edit, ...patch };
    this.rev += 1;
    this.lastActivity = Date.now();
  }

  private status(): SaveStatus {
    if (this.running) return 'saving';
    if (this.failed) return 'error';
    // Typed, waiting for its save: not "Saved" yet.
    if (this.rev !== this.savedRev) return 'idle';
    return this.everSaved ? 'saved' : 'idle';
  }

  private state(): SessionState {
    return { edit: this.edit, uploads: this.uploads, status: this.status(), errors: this.errors };
  }

  private emit(): void {
    this.snapshot = this.state();
    for (const listener of [...this.listeners]) listener();
    for (const listener of [...sessionListeners]) listener();
  }
}

const sessions = new Map<string, ZoneSession>();
const sessionListeners = new Set<Listener>();

/** The session of this zone, started from the zone's snapshot unless one is alive (or not long settled). */
export function sessionFor(report: ReportDoc, zone: ZoneDoc): ZoneSession {
  const existing = sessions.get(`${report.id}/${zone.id}`);
  if (existing && !existing.expired(Date.now())) return existing;
  const version = zone.versions[0];
  const created = new ZoneSession(report, zone.id, zone.name, version?.n ?? 1, {
    photos: version?.photos ?? [],
    comment: version?.storeComment ?? '',
    notInCampaign: zone.state === 'not_in_campaign',
  });
  sessions.set(created.key, created);
  return created;
}

/** Changes in any session (for the report screen). */
export function subscribeSessions(listener: Listener): () => void {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
}

export interface ReportSaveState {
  /** 'pending' while an upload or save is under way, 'failed' when a save failed and still has to be repeated. */
  saves: 'idle' | 'pending' | 'failed';
  /** Ids of the zones with a lost upload (see ZoneSession.lostUpload). */
  lostUploads: string[];
}

const lastSaveStates = new Map<string, ReportSaveState>();

/**
 * Whether the zones of a report are all stored. A report must not be sent before its saves are 'idle' and no zone
 * has a lost upload. The same object comes back while nothing changed (useSyncExternalStore compares snapshots).
 */
export function reportSaveState(reportId: string): ReportSaveState {
  let saves: ReportSaveState['saves'] = 'idle';
  const lostUploads: string[] = [];
  for (const [key, session] of sessions) {
    if (!key.startsWith(`${reportId}/`)) continue;
    if (session.pending) saves = 'pending';
    else if (session.unsaved && saves === 'idle') saves = 'failed';
    if (session.lostUpload) lostUploads.push(session.zoneId);
  }
  const last = lastSaveStates.get(reportId);
  if (last && last.saves === saves && last.lostUploads.join() === lostUploads.join()) return last;
  const next = { saves, lostUploads };
  lastSaveStates.set(reportId, next);
  return next;
}

export function retryFailedSaves(reportId: string): void {
  for (const [key, session] of sessions) {
    if (key.startsWith(`${reportId}/`) && session.unsaved) void session.save();
  }
}

/** Forgets every session; for tests. */
export function clearZoneSessions(): void {
  for (const session of sessions.values()) session.dispose();
  sessions.clear();
  lastSaveStates.clear();
}
