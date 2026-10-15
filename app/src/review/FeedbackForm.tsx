import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { localDate } from '@shared/dates';
import type { ReportDoc, Stroke, ZoneDoc } from '@shared/types';
import { giveFeedback } from '../api';
import { usePhotoUrl } from '../data/hooks';
import { useT } from '../i18n/I18nProvider';
import { PhotoWithStrokes } from '../photos/PhotoWithStrokes';
import { useToast } from '../ui/Toast';
import { AnnotationCanvas } from './AnnotationCanvas';

const MAX_COMMENT = 1000;

/**
 * One photo of a zone's version with the form for feedback on it: a comment, red circles drawn on the photo
 * (optional) and the date the store has to correct it by. Sent once the comment and the deadline are there.
 * The photo is shown once: while marking, the drawing surface takes its place.
 */
export function FeedbackForm({ report, zone, version, photoIndex, photoAlt, children }: {
  report: ReportDoc;
  zone: ZoneDoc;
  version: number;
  photoIndex: number;
  /** The name of the photo, e.g. "Photo 1". */
  photoAlt: string;
  /** Shown between the photo and the form: the feedback already given on this photo. */
  children?: ReactNode;
}) {
  const { t } = useT();
  const toast = useToast();
  const ids = useId();
  const [comment, setComment] = useState('');
  const [deadline, setDeadline] = useState('');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [marking, setMarking] = useState(false);
  const [sending, setSending] = useState(false);
  const sendStarted = useRef(false);

  const photoPath = zone.versions.find((v) => v.n === version)?.photos[photoIndex]?.path ?? '';
  const photoUrl = usePhotoUrl(photoPath);
  const surface = useRef<HTMLDivElement>(null);

  // Feedback already given can stand between the photo and the button: bring the drawing surface into view.
  useEffect(() => {
    if (marking) surface.current?.scrollIntoView?.({ block: 'nearest' });
  }, [marking]);

  const text = comment.trim();
  // The date picker's min does not stop a typed or remembered date; the server rejects one before today anyway.
  const today = localDate(Date.now(), report.timezone);
  const pastDeadline = deadline !== '' && deadline < today;
  const canSend = text.length > 0 && text.length <= MAX_COMMENT && deadline !== '' && !pastDeadline && !sending;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!canSend || sendStarted.current) return;
    sendStarted.current = true;
    setSending(true);
    try {
      await giveFeedback({ reportId: report.id, zoneId: zone.id, version, photoIndex, comment: text, strokes, deadline });
      setComment('');
      setDeadline('');
      setStrokes([]);
      setMarking(false);
      toast(t('review.feedbackSent'));
    } catch {
      toast(t('error.generic')); // what was typed stays, so it can be sent again
    } finally {
      sendStarted.current = false;
      setSending(false);
    }
  }

  return (
    <>
      {marking && photoUrl ? (
        <div ref={surface}>
          <AnnotationCanvas photoUrl={photoUrl} strokes={strokes} onChange={setStrokes} />
        </div>
      ) : <PhotoWithStrokes path={photoPath} strokes={[]} alt={photoAlt} />}
      {children}
      <form className="feedback-form" onSubmit={(e) => void send(e)} noValidate>
        <button
          type="button"
          className="btn"
          aria-pressed={marking}
          disabled={!photoUrl}
          onClick={() => setMarking((on) => !on)}
        >
          {t('review.markOnPhoto')}
        </button>

        <label className="field" htmlFor={`${ids}-comment`}>
          <span>{t('review.feedback')}</span>
        </label>
        <textarea id={`${ids}-comment`} value={comment} maxLength={MAX_COMMENT} onChange={(e) => setComment(e.target.value)} />

        <label className="field" htmlFor={`${ids}-deadline`}>
          <span>{t('review.deadline')}</span>
        </label>
        <input
          id={`${ids}-deadline`}
          type="date"
          value={deadline}
          min={today}
          aria-invalid={pastDeadline || undefined}
          onChange={(e) => setDeadline(e.target.value)}
        />

        <button type="submit" className="btn btn-primary" disabled={!canSend}>{t('review.sendFeedback')}</button>
      </form>
    </>
  );
}
