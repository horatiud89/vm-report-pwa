import { ROLE_LABEL } from '@shared/access';
import { formatDayMonth, isOverdue } from '@shared/dates';
import type { FeedbackDoc, ReportDoc } from '@shared/types';
import { formatDate } from '../i18n/formatDate';
import { useT } from '../i18n/I18nProvider';

/**
 * Who gave a piece of feedback and when, what they wrote and the deadline (red once an open one has passed).
 * `showStatus` adds whether it is still open or the store has answered it.
 */
export function FeedbackNote({ feedback, report, showStatus = false }: { feedback: FeedbackDoc; report: ReportDoc; showStatus?: boolean }) {
  const { t, lang } = useT();
  const open = feedback.status === 'open';
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
        {showStatus && <span className="tag">{t(open ? 'review.statusOpen' : 'review.statusAnswered')}</span>}
      </p>
    </article>
  );
}
