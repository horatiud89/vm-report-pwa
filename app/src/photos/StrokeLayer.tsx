import type { Stroke } from '@shared/types';
import { strokesToPolylinePoints } from '../review/strokes';

/** Red of the reviewer's circles. */
const STROKE_COLOR = '#d32f2f';

/**
 * The reviewer's strokes as an svg that covers exactly the photo below it. Stroke points are fractions of the
 * photo (0..1), so a 1x1 viewBox stretched over the image lines up at any size; the line width stays 4 screen
 * pixels because the stroke does not scale. The photo and the drawing surface use this one layer, so what the
 * reviewer draws is what the store sees.
 */
export function StrokeLayer({ strokes }: { strokes: Stroke[] }) {
  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      {strokes.map((stroke, index) => (
        <polyline
          key={index}
          points={strokesToPolylinePoints(stroke)}
          fill="none"
          stroke={STROKE_COLOR}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
