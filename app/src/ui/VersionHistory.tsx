import type { FeedbackDoc, ReportDoc, ZoneVersion } from '@shared/types';
import { formatDate } from '../i18n/formatDate';
import { useT } from '../i18n/I18nProvider';
import { PhotoThumb } from '../photos/PhotoThumb';
import { PhotoWithStrokes } from '../photos/PhotoWithStrokes';
import { FeedbackNote } from './FeedbackNote';

/**
 * One version of a zone as it was sent: its photos, the store's comment and the feedback given on it, each
 * piece of feedback under its photo with the circles drawn on it. Nothing here can be changed.
 */
export function VersionHistory({ id, report, version, feedback, showStatus = false }: {
  id: string;
  report: ReportDoc;
  version: ZoneVersion;
  feedback: FeedbackDoc[];
  showStatus?: boolean;
}) {
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
                <FeedbackNote feedback={f} report={report} showStatus={showStatus} />
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
