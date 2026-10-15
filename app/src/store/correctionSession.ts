import { MAX_PHOTOS } from '@shared/status';
import type { PhotoRef, ReportDoc, ZoneDoc } from '@shared/types';
import { sendCorrection } from '../api';
import { uploadZonePhoto } from '../photos/compress';
import type { Upload } from './zoneSession';

/** What the correction screen shows. A new object after every change, so it can be used with useSyncExternalStore. */
export interface CorrectionState {
  /** Uploaded, ready to be sent. */
  photos: PhotoRef[];
  uploads: Upload[];
  comment: string;
  sending: boolean;
  /** The correction was accepted; the session is over and cannot send again. */
  sent: boolean;
  /** Counts failed uploads and sends; the screen that is open toasts when it grows. */
  errors: number;
}

type Listener = () => void;

/**
 * The correction a store is preparing for one zone: new photos (uploaded as they are picked), the comment and the
 * send itself. It outlives the screen, like the draft's ZoneSession: an upload that ends after the user left still
 * lands here, and coming back shows it. Nothing is stored on the server until `send`, so after a successful send
 * the session is dropped and a failed one keeps everything for another try.
 */
export class CorrectionSession {
  private state: CorrectionState = { photos: [], uploads: [], comment: '', sending: false, sent: false, errors: 0 };
  private nextUpload = 0;
  private readonly listeners = new Set<Listener>();

  /** `version` is the version this correction becomes: the zone's latest plus one. */
  constructor(readonly report: ReportDoc, readonly zoneId: string, readonly version: number) {}

  get key(): string {
    return `${this.report.id}/${this.zoneId}`;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = (): CorrectionState => this.state;

  private get locked(): boolean {
    return this.state.sending || this.state.sent;
  }

  /** Uploads the file as a photo of the new version; at most three photos, uploads included. */
  async addPhoto(file: File): Promise<void> {
    if (this.locked || this.state.photos.length + this.state.uploads.length >= MAX_PHOTOS) return;
    const id = this.nextUpload++;
    this.update({ uploads: [...this.state.uploads, { id, progress: 0 }] });
    try {
      const photo = await uploadZonePhoto(this.report, this.zoneId, this.version, file, (progress) => {
        this.update({ uploads: this.state.uploads.map((u) => (u.id === id ? { ...u, progress } : u)) });
      });
      this.update({ uploads: this.state.uploads.filter((u) => u.id !== id), photos: [...this.state.photos, photo] });
    } catch {
      this.update({ uploads: this.state.uploads.filter((u) => u.id !== id), errors: this.state.errors + 1 });
    }
  }

  removePhoto(path: string): void {
    if (this.locked) return;
    this.update({ photos: this.state.photos.filter((p) => p.path !== path) });
  }

  setComment(comment: string): void {
    if (this.locked) return;
    this.update({ comment });
  }

  /** Sends the correction. False when it was not sent: nothing to send yet, already on its way, or it failed. */
  async send(): Promise<boolean> {
    const { photos, uploads, comment } = this.state;
    if (this.locked || uploads.length > 0 || photos.length === 0) return false;
    this.update({ sending: true });
    try {
      await sendCorrection({ reportId: this.report.id, zoneId: this.zoneId, photos, storeComment: comment.trim() });
    } catch {
      this.update({ sending: false, errors: this.state.errors + 1 });
      return false;
    }
    if (sessions.get(this.key) === this) sessions.delete(this.key);
    this.update({ sending: false, sent: true });
    return true;
  }

  private update(patch: Partial<CorrectionState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) listener();
  }
}

const sessions = new Map<string, CorrectionSession>();

/**
 * The session of this zone's next correction. One that belongs to an earlier round (the zone has moved on since,
 * e.g. the correction was sent from another phone) is replaced, so old photos never go into a new version.
 */
export function correctionSessionFor(report: ReportDoc, zone: ZoneDoc): CorrectionSession {
  const version = (zone.versions.at(-1)?.n ?? 0) + 1;
  const key = `${report.id}/${zone.id}`;
  const existing = sessions.get(key);
  if (existing && existing.version === version) return existing;
  const created = new CorrectionSession(report, zone.id, version);
  sessions.set(key, created);
  return created;
}

/** Forgets every session; for tests. */
export function clearCorrectionSessions(): void {
  sessions.clear();
}
