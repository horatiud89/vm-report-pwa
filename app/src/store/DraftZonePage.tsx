import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { PhotoRef, ReportDoc, ZoneDoc } from '@shared/types';
import { updateDraftZone } from '../api';
import { useReport, useZone } from '../data/hooks';
import { useT } from '../i18n/I18nProvider';
import { PhotoPicker } from '../photos/PhotoPicker';
import { PhotoThumb } from '../photos/PhotoThumb';
import { uploadZonePhoto } from '../photos/compress';
import { Loading } from '../ui/Loading';
import { StatusBadge } from '../ui/StatusBadge';
import { useToast } from '../ui/Toast';

const MAX_COMMENT = 500;
/** A comment is saved this long after the last keystroke (or at once when the field is left). */
const COMMENT_SAVE_DELAY_MS = 800;

/** What the store has entered for the zone: exactly what updateDraftZone takes. */
interface Edit { photos: PhotoRef[]; comment: string; notInCampaign: boolean }
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
interface Upload { id: number; progress: number }

export function DraftZonePage() {
  const { reportId = '', zoneId = '' } = useParams();
  const { t } = useT();
  const report = useReport(reportId);
  const zone = useZone(reportId, zoneId);

  if (report.loading || zone.loading) return <Loading />;
  if (report.error || zone.error) return <p role="alert">{t('error.generic')}</p>;
  // No such zone (or report): the report page decides where to go next.
  if (!report.data || !zone.data) return <Navigate to={`/r/${reportId}`} replace />;

  return report.data.status === 'draft'
    ? <ZoneEditor key={`${report.data.id}/${zone.data.id}`} report={report.data} zone={zone.data} />
    : <ZoneReadOnly report={report.data} zone={zone.data} />;
}

/**
 * Edits the draft of one zone. The editor keeps the zone's data itself after loading it (the screen must not jump
 * under the user's fingers when a snapshot arrives) and sends all of it with every save, one save at a time.
 */
function ZoneEditor({ report, zone }: { report: ReportDoc; zone: ZoneDoc }) {
  const { t } = useT();
  const toast = useToast();
  const version = zone.versions[0];
  const [edit, setEdit] = useState<Edit>(() => ({
    photos: version?.photos ?? [],
    comment: version?.storeComment ?? '',
    notInCampaign: zone.state === 'not_in_campaign',
  }));
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [status, setStatus] = useState<SaveStatus>('idle');

  // The latest values for the save loop, timers and the unmount flush, which outlive a single render.
  const latest = useRef(edit);
  const running = useRef(false);
  const again = useRef(false);
  const commentTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commentDirty = useRef(false);
  const nextUpload = useRef(0);

  function change(patch: Partial<Edit>) {
    latest.current = { ...latest.current, ...patch };
    setEdit(latest.current);
    setStatus('idle');
  }

  /** Sends the zone as it is now; a change made while a save runs is sent right after it, never in parallel. */
  async function save() {
    clearTimeout(commentTimer.current);
    commentDirty.current = false;
    setStatus('saving');
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        const { photos, comment, notInCampaign } = latest.current;
        await updateDraftZone({ reportId: report.id, zoneId: zone.id, photos, storeComment: comment, notInCampaign });
      } while (again.current);
      setStatus('saved');
    } catch {
      setStatus('error');
      toast(t('error.generic'));
    } finally {
      running.current = false;
    }
  }

  const saveNow = useRef(save);
  useEffect(() => { saveNow.current = save; });
  // Leaving the screen within the wait must not lose the comment.
  useEffect(() => () => {
    clearTimeout(commentTimer.current);
    if (commentDirty.current) void saveNow.current();
  }, []);

  async function addPhoto(file: File) {
    const id = nextUpload.current++;
    setUploads((current) => [...current, { id, progress: 0 }]);
    try {
      const photo = await uploadZonePhoto(report, zone.id, version?.n ?? 1, file, (progress) => {
        setUploads((current) => current.map((u) => (u.id === id ? { ...u, progress } : u)));
      });
      change({ photos: [...latest.current.photos, photo] });
      void saveNow.current();
    } catch {
      toast(t('error.generic'));
    } finally {
      setUploads((current) => current.filter((u) => u.id !== id));
    }
  }

  function removePhoto(path: string) {
    change({ photos: latest.current.photos.filter((p) => p.path !== path) });
    void save();
  }

  function setNotInCampaign(notInCampaign: boolean) {
    change({ notInCampaign });
    void save();
  }

  function typeComment(comment: string) {
    change({ comment });
    commentDirty.current = true;
    clearTimeout(commentTimer.current);
    commentTimer.current = setTimeout(() => void saveNow.current(), COMMENT_SAVE_DELAY_MS);
  }

  function leaveComment() {
    if (commentDirty.current) void save();
  }

  const photoCount = edit.photos.length + uploads.length;

  return (
    <>
      <Link to={`/r/${report.id}`} className="back-link">{t('common.back')}</Link>
      <h1>{zone.name}</h1>
      <p className="muted">{report.campaignName}</p>
      <div className="save-status" aria-live="polite">
        {status === 'saving' && t('store.saving')}
        {status === 'saved' && t('store.saved')}
        {status === 'error' && (
          <>
            <span className="form-error">{t('error.generic')}</span>
            <button type="button" className="btn btn-small" onClick={() => void save()}>{t('common.retry')}</button>
          </>
        )}
      </div>

      {photoCount > 0 && (
        <div className="thumbs">
          {edit.photos.map((photo, index) => (
            <PhotoThumb key={photo.path} photo={photo} alt={t('store.photo', { n: index + 1 })}>
              <button type="button" className="thumb-remove" aria-label={t('store.removePhoto')} onClick={() => removePhoto(photo.path)}>
                <span aria-hidden="true">×</span>
              </button>
            </PhotoThumb>
          ))}
          {uploads.map((upload) => {
            const percent = Math.round(upload.progress * 100);
            return (
              <div key={upload.id} className="thumb thumb-uploading">
                <div className="progress" role="progressbar" aria-label={t('store.uploading', { n: percent })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                  <div className="progress-bar" style={{ width: `${percent}%` }} />
                </div>
                <span className="thumb-caption">{t('store.uploading', { n: percent })}</span>
              </div>
            );
          })}
        </div>
      )}

      <PhotoPicker count={photoCount} disabled={edit.notInCampaign} onPick={(file) => void addPhoto(file)} />

      <label className="field">
        <span>{t('store.comment')}</span>
        <textarea
          value={edit.comment}
          maxLength={MAX_COMMENT}
          onChange={(e) => typeComment(e.target.value)}
          onBlur={leaveComment}
        />
      </label>

      <label className="choice">
        <input
          type="checkbox"
          checked={edit.notInCampaign}
          disabled={photoCount > 0}
          onChange={(e) => setNotInCampaign(e.target.checked)}
        />
        <span>{t('store.notInCampaign')}</span>
      </label>
    </>
  );
}

/** A zone of a sent report: what was sent, nothing to edit (corrections come with their own screen). */
function ZoneReadOnly({ report, zone }: { report: ReportDoc; zone: ZoneDoc }) {
  const { t } = useT();
  const sent = zone.versions.at(-1);
  return (
    <>
      <Link to={`/r/${report.id}`} className="back-link">{t('common.back')}</Link>
      <h1>{zone.name}</h1>
      <p className="muted">{report.campaignName}</p>
      <p><StatusBadge state={zone.state} /></p>
      {sent && sent.photos.length > 0 && (
        <div className="thumbs">
          {sent.photos.map((photo, index) => (
            <PhotoThumb key={photo.path} photo={photo} alt={t('store.photo', { n: index + 1 })} />
          ))}
        </div>
      )}
      {sent?.storeComment && (
        <>
          <h2>{t('review.storeComment')}</h2>
          <p className="comment-text">{sent.storeComment}</p>
        </>
      )}
    </>
  );
}
