import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Stroke } from '@shared/types';
import { useT } from '../i18n/I18nProvider';
import { StrokeLayer } from '../photos/StrokeLayer';
import { MAX_STROKES, MAX_STROKE_VALUES, appendPoint, normalizePoint } from './strokes';

/** A stroke of one point is drawn as a dot: a polyline needs two points to show (the same one twice will do). */
const drawable = (points: number[]) => (points.length === 2 ? [...points, ...points] : points);

interface Drawing { pointerId: number; points: number[] }

/**
 * The photo with a surface to draw red circles on with a finger (or mouse). Points are recorded as fractions of
 * the displayed photo box, the very box PhotoWithStrokes draws over, so the store sees the circles exactly where
 * they were drawn. `touch-action: none` keeps the page from scrolling while the finger draws.
 */
export function AnnotationCanvas({ photoUrl, strokes, onChange }: {
  photoUrl: string;
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
}) {
  const { t } = useT();
  const imgRef = useRef<HTMLImageElement>(null);
  // The stroke under the finger lives here until the finger lifts; only then is it a stroke of the feedback.
  const drawing = useRef<Drawing | null>(null);
  const [live, setLive] = useState<Stroke | null>(null);

  /** The pointer as a fraction of the photo, or null while the photo has no size yet. */
  function pointOf(e: PointerEvent): [number, number] | null {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
    return normalizePoint(e.clientX, e.clientY, rect);
  }

  function start(e: PointerEvent<HTMLDivElement>) {
    // One finger at a time; the mouse draws with its main button only.
    if (drawing.current || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (strokes.length >= MAX_STROKES) return;
    const point = pointOf(e);
    if (!point) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawing.current = { pointerId: e.pointerId, points: appendPoint([], point[0], point[1]) };
    setLive({ points: drawing.current.points });
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const current = drawing.current;
    if (!current || e.pointerId !== current.pointerId || current.points.length >= MAX_STROKE_VALUES) return;
    const point = pointOf(e);
    if (!point) return;
    const points = appendPoint(current.points, point[0], point[1]);
    if (points === current.points) return;
    current.points = points;
    setLive({ points });
  }

  function end(e: PointerEvent<HTMLDivElement>) {
    const current = drawing.current;
    if (!current || e.pointerId !== current.pointerId) return;
    drawing.current = null;
    setLive(null);
    const last = current.points.length < MAX_STROKE_VALUES ? pointOf(e) : null;
    const points = last ? appendPoint(current.points, last[0], last[1]) : current.points;
    // A tap is a mark too: at least one x,y pair, never an empty list.
    onChange([...strokes, { points: drawable(points) }]);
  }

  function cancel(e: PointerEvent<HTMLDivElement>) {
    if (drawing.current?.pointerId !== e.pointerId) return;
    drawing.current = null;
    setLive(null);
  }

  return (
    <div className="annotate">
      <p className="muted annotate-hint">{t('review.drawHint')}</p>
      <div
        role="group"
        aria-label={t('review.markOnPhoto')}
        className="annotate-surface"
        style={{ touchAction: 'none' }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={cancel}
      >
        <img ref={imgRef} src={photoUrl} alt="" draggable={false} />
        <StrokeLayer strokes={live ? [...strokes, { points: drawable(live.points) }] : strokes} />
      </div>
      <button type="button" className="btn btn-small" disabled={strokes.length === 0} onClick={() => onChange(strokes.slice(0, -1))}>
        {t('review.undo')}
      </button>
    </div>
  );
}
