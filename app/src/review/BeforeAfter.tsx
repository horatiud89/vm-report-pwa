import { useId } from 'react';
import type { ReactNode } from 'react';
import type { FeedbackDoc, ReportDoc, ZoneVersion } from '@shared/types';
import { useT } from '../i18n/I18nProvider';
import { PhotoWithStrokes } from '../photos/PhotoWithStrokes';
import { FeedbackNote } from '../ui/FeedbackNote';

/**
 * The photos the reviewer gave feedback on (with the circles drawn on them and the feedback itself) next to the
 * photos the store sent in answer, photo for photo. Narrow screens stack them, Before above After; each is labelled.
 */
export function BeforeAfter({ report, before, after, feedback, renderAfter }: {
  report: ReportDoc;
  before: ZoneVersion;
  after: ZoneVersion;
  /** The feedback of the zone; only the part given on `before` is used. */
  feedback: FeedbackDoc[];
  /** Photo `index` of `after` under its caption, named `alt`: the page shows it there once, with what goes with it. */
  renderAfter: (index: number, alt: string) => ReactNode;
}) {
  const { t } = useT();
  const id = useId();
  const given = feedback.filter((f) => f.version === before.n).sort((a, b) => a.createdAt - b.createdAt);
  const rows = Math.max(before.photos.length, after.photos.length);

  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{t('review.beforeAfter')}</h2>
      {Array.from({ length: rows }, (_, index) => {
        const was = before.photos[index];
        const now = after.photos[index];
        const notes = given.filter((f) => f.photoIndex === index);
        const name = t('store.photo', { n: index + 1 });
        return (
          <div key={index} className="compare-row">
            {was ? (
              <figure className="compare-cell">
                <figcaption>{t('review.before')} · {name}</figcaption>
                <PhotoWithStrokes path={was.path} strokes={notes.flatMap((f) => f.strokes)} alt={`${t('review.before')}: ${name}`} />
                {notes.map((f) => <FeedbackNote key={f.id} feedback={f} report={report} showStatus />)}
              </figure>
            ) : <div className="compare-empty" aria-hidden="true" />}
            {now && (
              <figure className="compare-cell">
                <figcaption>{t('review.after')} · {name}</figcaption>
                {renderAfter(index, `${t('review.after')}: ${name}`)}
              </figure>
            )}
          </div>
        );
      })}
    </section>
  );
}
