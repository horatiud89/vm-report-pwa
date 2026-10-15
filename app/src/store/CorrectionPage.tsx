import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ROLE_LABEL } from '@shared/access';
import { formatDayMonth, isOverdue } from '@shared/dates';
import type { FeedbackDoc, ReportDoc, ZoneDoc, ZoneVersion } from '@shared/types';
import { useFeedback, useReport, useZone } from '../data/hooks';
import { formatDate } from '../i18n/formatDate';
import { useT } from '../i18n/I18nProvider';
import { PhotoPicker } from '../photos/PhotoPicker';
import { PhotoThumb } from '../photos/PhotoThumb';
import { PhotoWithStrokes } from '../photos/PhotoWithStrokes';
import { Loading } from '../ui/Loading';
import { StatusBadge } from '../ui/StatusBadge';
import { useToast } from '../ui/Toast';
import { correctionSessionFor } from './correctionSession';
import { badgeState } from './zoneBadge';

const MAX_COMMENT = 500;

const newestFirst = (a: FeedbackDoc, b: FeedbackDoc) => b.createdAt - a.createdAt;

/**
 * A zone of a sent report. When the reviewer asked for a correction it shows the feedback on each photo and the
 * form for the new photos; in every other state it shows the zone's history (versions and feedback), read-only.
 */
export function CorrectionPage() {
  const { reportId = '', zoneId = '' } = useParams();
  const { t } = useT();
  const report = useReport(reportId);
  const zone = useZone(reportId, zoneId);
  const feedback = useFeedback(reportId, zoneId);

  if (report.loading || zone.loading || feedback.loading) return <Loading />;
  if (report.error || zone.error || feedback.error) return <p role="alert">{t('error.generic')}</p>;
  if (!report.data) return <Navigate to="/" replace />;
  if (!zone.data) return <Navigate to={`/r/${reportId}`} replace />;

  return zone.data.state === 'needs_correction'
    // A new round of feedback (one more version) starts a new form.
    ? <CorrectionForm key={`${report.data.id}/${zone.data.id}/${zone.data.versions.length}`} report={report.data} zone={zone.data} feedback={feedback.data} />
    : <ZoneHistory report={report.data} zone={zone.data} feedback={feedback.data} />;
}

/** Who gave a piece of feedback and when, what they wrote and the deadline (red once an open one has passed). */
function FeedbackNote({ feedback, report, open }: { feedback: FeedbackDoc; report: ReportDoc; open: boolean }) {
  const { t, lang } = useT();
  const overdue = open && isOverdue(feedback.deadline, Date.now(), report.timezone);
  return (
    <article className="feedback-note">
      <p className="feedback-author">
        <strong>{feedback.authorName}</strong> · {ROLE_LABEL[feedback.authorRole]}
        <span className="muted">{formatDate(lang, feedback.createdAt, report.timezone)}</span>
      </p>
      {feedback.comment && <p className="comment-text">{feedback.comment}</p>}
      <p className={overdue ? 'feedback-deadline is-overdue' : 'feedback-deadline'}>
        <span>{t('common.deadline', { date: formatDayMonth(feedback.deadline) })}</span>
        {overdue && <span>{t('state.overdue')}</span>}
      </p>
    </article>
  );
}

/**
 * The open feedback under the photo it refers to, and below it the new photos and the comment. The new photos
 * and the comment live in a session (correctionSession.ts) that keeps uploads going when this screen is left.
 */
function CorrectionForm({ report, zone, feedback }: { report: ReportDoc; zone: ZoneDoc; feedback: FeedbackDoc[] }) {
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const ids = useId();
  // The session is fixed for this screen (the page keys the form by report, zone and round).
  const [session] = useState(() => correctionSessionFor(report, zone));
  const { photos, uploads, comment, sending, sent, errors } = useSyncExternalStore(session.subscribe, session.getSnapshot);

  // A failure that happens while this screen is open is toasted.
  const errorsSeen = useRef(errors);
  useEffect(() => {
    if (errors > errorsSeen.current) toast(t('error.generic'));
    errorsSeen.current = errors;
  }, [errors, toast, t]);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const latest = zone.versions.at(-1);
  const open = feedback.filter((f) => f.status === 'open' && f.version === latest?.n).sort(newestFirst);
  const photoCount = photos.length + uploads.length;
  const busy = sending || sent;

  async function send() {
    if (!(await session.send())) return;
    toast(t('state.correction_sent'));
    if (mounted.current) navigate('/');
  }

  return (
    <>
      <Link to={`/r/${report.id}`} className="back-link">{t('common.back')}</Link>
      <h1>{zone.name}</h1>
      <p className="muted">{report.campaignName}</p>
      <p><StatusBadge state={badgeState(zone, report, Date.now())} /></p>

      {(latest?.photos ?? []).map((photo, index) => {
        const notes = open.filter((f) => f.photoIndex === index);
        const name = t('store.photo', { n: index + 1 });
        return (
          <section key={photo.path} aria-labelledby={`${ids}-photo-${index}`}>
            <h2 id={`${ids}-photo-${index}`}>{name}</h2>
            <PhotoWithStrokes path={photo.path} strokes={notes.flatMap((f) => f.strokes)} alt={name} />
            {notes.map((f) => <FeedbackNote key={f.id} feedback={f} report={report} open />)}
          </section>
        );
      })}

      <section aria-labelledby={`${ids}-new`}>
        <h2 id={`${ids}-new`}>{t('store.newPhotos')}</h2>
        {photoCount > 0 && (
          <div className="thumbs">
            {photos.map((photo, index) => (
              <PhotoThumb key={photo.path} photo={photo} alt={t('store.photo', { n: index + 1 })}>
                <button type="button" className="thumb-remove" aria-label={t('store.removePhoto')} disabled={busy} onClick={() => session.removePhoto(photo.path)}>
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
        <PhotoPicker count={photoCount} disabled={busy} onPick={(file) => void session.addPhoto(file)} />
        <label className="field">
          <span>{t('store.comment')}</span>
          <textarea value={comment} maxLength={MAX_COMMENT} disabled={busy} onChange={(e) => session.setComment(e.target.value)} />
        </label>
      </section>

      <div className="action-bar">
        <button type="button" className="btn btn-primary" disabled={busy || uploads.length > 0 || photos.length === 0} onClick={() => void send()}>
          {t('store.sendCorrection')}
        </button>
      </div>
    </>
  );
}

/** Every version of the zone, newest first, with the feedback given on it. Nothing here can be changed. */
function ZoneHistory({ report, zone, feedback }: { report: ReportDoc; zone: ZoneDoc; feedback: FeedbackDoc[] }) {
  const { t } = useT();
  const ids = useId();
  const versions = [...zone.versions].sort((a, b) => b.n - a.n);
  return (
    <>
      <Link to={`/r/${report.id}`} className="back-link">{t('common.back')}</Link>
      <h1>{zone.name}</h1>
      <p className="muted">{report.campaignName}</p>
      <p><StatusBadge state={zone.state} /></p>
      {versions.map((version) => (
        <VersionHistory
          key={version.n}
          id={`${ids}-v${version.n}`}
          report={report}
          version={version}
          feedback={feedback.filter((f) => f.version === version.n).sort(newestFirst)}
        />
      ))}
    </>
  );
}

function VersionHistory({ id, report, version, feedback }: { id: string; report: ReportDoc; version: ZoneVersion; feedback: FeedbackDoc[] }) {
  const { t, lang } = useT();
  // A zone that is not part of the campaign has an empty first version: nothing to show.
  if (version.photos.length === 0 && !version.storeComment && feedback.length === 0) return null;
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{t('store.version', { n: version.n })}</h2>
      <p className="muted">{formatDate(lang, version.createdAt, report.timezone)}</p>
      {version.photos.length > 0 && (
        <div className="thumbs">
          {version.photos.map((photo, index) => (
            <PhotoThumb key={photo.path} photo={photo} alt={t('store.photo', { n: index + 1 })} />
          ))}
        </div>
      )}
      {version.storeComment && (
        <>
          <h3>{t('review.storeComment')}</h3>
          <p className="comment-text">{version.storeComment}</p>
        </>
      )}
      {feedback.length > 0 && (
        <>
          <h3>{t('review.feedback')}</h3>
          {feedback.map((f) => {
            const photo = version.photos[f.photoIndex];
            return (
              <div key={f.id} className="feedback-item">
                {photo && <PhotoWithStrokes path={photo.path} strokes={f.strokes} alt={t('store.photo', { n: f.photoIndex + 1 })} />}
                <FeedbackNote feedback={f} report={report} open={f.status === 'open'} />
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
