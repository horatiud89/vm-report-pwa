import { useId, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import type { FeedbackDoc, ReportDoc, ZoneDoc } from '@shared/types';
import { approveZone } from '../api';
import { useFeedback, useReport, useZone } from '../data/hooks';
import { useT } from '../i18n/I18nProvider';
import { PhotoWithStrokes } from '../photos/PhotoWithStrokes';
import { badgeState } from '../store/zoneBadge';
import { FeedbackNote } from '../ui/FeedbackNote';
import { Loading } from '../ui/Loading';
import { StatusBadge } from '../ui/StatusBadge';
import { useToast } from '../ui/Toast';
import { VersionHistory } from '../ui/VersionHistory';
import { BeforeAfter } from './BeforeAfter';
import { FeedbackForm } from './FeedbackForm';

const newestFirst = (a: FeedbackDoc, b: FeedbackDoc) => b.createdAt - a.createdAt;

/** A zone of a sent report for the reviewer: what the store sent, the feedback so far, a form per photo, Approve. */
export function ReviewZonePage() {
  const { reportId = '', zoneId = '' } = useParams();
  const { t } = useT();
  const report = useReport(reportId);
  const zone = useZone(reportId, zoneId);
  const feedback = useFeedback(reportId, zoneId);

  if (report.loading || zone.loading || feedback.loading) return <Loading />;
  if (report.error || zone.error || feedback.error) return <p role="alert">{t('error.generic')}</p>;
  if (!report.data) return <Navigate to="/" replace />;
  if (!zone.data) return <Navigate to={`/r/${reportId}`} replace />;
  return <ZoneReview report={report.data} zone={zone.data} feedback={feedback.data} />;
}

function ZoneReview({ report, zone, feedback }: { report: ReportDoc; zone: ZoneDoc; feedback: FeedbackDoc[] }) {
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const ids = useId();
  const [approving, setApproving] = useState(false);
  const approveStarted = useRef(false);

  const latest = zone.versions.at(-1);
  const previous = zone.versions.at(-2);
  const included = zone.state !== 'not_in_campaign' && latest !== undefined;
  const canApprove = zone.state === 'submitted' || zone.state === 'correction_sent';
  // Everything older than the version that is compared with the current one.
  const older = previous ? zone.versions.filter((v) => v.n < previous.n).sort((a, b) => b.n - a.n) : [];

  async function approve() {
    if (approveStarted.current) return;
    approveStarted.current = true;
    setApproving(true);
    try {
      await approveZone({ reportId: report.id, zoneId: zone.id });
      toast(t('state.approved'));
      navigate(`/r/${report.id}`);
    } catch {
      approveStarted.current = false;
      setApproving(false);
      toast(t('error.generic'));
    }
  }

  return (
    <>
      <Link to={`/r/${report.id}`} className="back-link">{t('common.back')}</Link>
      <h1>{zone.name}</h1>
      <p className="muted">{report.storeCode} {report.storeName} · {report.campaignName}</p>
      <p><StatusBadge state={badgeState(zone, report, Date.now())} /></p>

      {included && latest.storeComment && (
        <section>
          <h2>{t('review.storeComment')}</h2>
          <p className="comment-text">{latest.storeComment}</p>
        </section>
      )}

      {included && previous && <BeforeAfter report={report} before={previous} after={latest} feedback={feedback} />}

      {included && latest.photos.map((photo, index) => {
        const notes = feedback.filter((f) => f.version === latest.n && f.photoIndex === index).sort(newestFirst);
        const name = t('store.photo', { n: index + 1 });
        return (
          <section key={photo.path} aria-labelledby={`${ids}-photo-${index}`}>
            <h2 id={`${ids}-photo-${index}`}>{name}</h2>
            <PhotoWithStrokes path={photo.path} strokes={[]} alt={name} />
            {notes.map((f) => (
              // Each feedback keeps its own copy of the photo, so its circles are not mixed up with another's.
              <div key={f.id} className="feedback-item">
                {f.strokes.length > 0 && (
                  <div className="feedback-photo">
                    <PhotoWithStrokes path={photo.path} strokes={f.strokes} />
                  </div>
                )}
                <FeedbackNote feedback={f} report={report} showStatus />
              </div>
            ))}
            <FeedbackForm report={report} zone={zone} version={latest.n} photoIndex={index} />
          </section>
        );
      })}

      {older.map((version) => (
        <VersionHistory
          key={version.n}
          id={`${ids}-v${version.n}`}
          report={report}
          version={version}
          feedback={feedback.filter((f) => f.version === version.n).sort(newestFirst)}
          showStatus
        />
      ))}

      {canApprove && (
        <div className="action-bar">
          <button type="button" className="btn btn-primary" disabled={approving} onClick={() => void approve()}>
            {t('review.approve')}
          </button>
        </div>
      )}
    </>
  );
}
