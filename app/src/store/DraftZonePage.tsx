import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { ReportDoc, ZoneDoc } from '@shared/types';
import { useReport, useZone } from '../data/hooks';
import { useT } from '../i18n/I18nProvider';
import { PhotoPicker } from '../photos/PhotoPicker';
import { PhotoThumb } from '../photos/PhotoThumb';
import { Loading } from '../ui/Loading';
import { StatusBadge } from '../ui/StatusBadge';
import { useToast } from '../ui/Toast';
import { sessionFor } from './zoneSession';

const MAX_COMMENT = 500;

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
 * Edits the draft of one zone through its session (zoneSession.ts), which keeps the values, the uploads under way
 * and the saves going when this screen is left, and hands them back when it is opened again.
 */
function ZoneEditor({ report, zone }: { report: ReportDoc; zone: ZoneDoc }) {
  const { t } = useT();
  const toast = useToast();
  // The session is fixed for this screen (the page keys the editor by report and zone).
  const [session] = useState(() => sessionFor(report, zone));
  const { edit, uploads, status, errors } = useSyncExternalStore(session.subscribe, session.getSnapshot);

  useEffect(() => {
    session.attach();
    return () => session.detach();
  }, [session]);

  // A failure that happens while this screen is open is toasted; one from an earlier visit is only shown inline.
  const errorsSeen = useRef(errors);
  useEffect(() => {
    if (errors > errorsSeen.current) toast(t('error.generic'));
    errorsSeen.current = errors;
  }, [errors, toast, t]);

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
            <button type="button" className="btn btn-small" onClick={() => void session.save()}>{t('common.retry')}</button>
          </>
        )}
      </div>

      {photoCount > 0 && (
        <div className="thumbs">
          {edit.photos.map((photo, index) => (
            <PhotoThumb key={photo.path} photo={photo} alt={t('store.photo', { n: index + 1 })}>
              <button type="button" className="thumb-remove" aria-label={t('store.removePhoto')} onClick={() => session.removePhoto(photo.path)}>
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

      <PhotoPicker count={photoCount} disabled={edit.notInCampaign} onPick={(file) => void session.addPhoto(file)} />

      <label className="field">
        <span>{t('store.comment')}</span>
        <textarea
          value={edit.comment}
          maxLength={MAX_COMMENT}
          onChange={(e) => session.typeComment(e.target.value)}
          onBlur={() => session.leaveComment()}
        />
      </label>

      <label className="choice">
        <input
          type="checkbox"
          checked={edit.notInCampaign}
          disabled={photoCount > 0}
          onChange={(e) => session.setNotInCampaign(e.target.checked)}
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
