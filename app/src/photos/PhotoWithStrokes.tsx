import type { Stroke } from '@shared/types';
import { usePhotoUrl } from '../data/hooks';
import { strokesToPolylinePoints } from '../review/strokes';

/** Red of the reviewer's circles. */
const STROKE_COLOR = '#d32f2f';

/**
 * A stored photo at its natural proportions (never cropped) with the reviewer's strokes drawn over it. Stroke
 * points are fractions of the photo (0..1), so a 1x1 viewBox stretched over the image lines up at any size;
 * the line width stays 4 screen pixels because the stroke does not scale.
 */
export function PhotoWithStrokes({ path, strokes, alt = '' }: { path: string; strokes: Stroke[]; alt?: string }) {
  const url = usePhotoUrl(path);
  if (!url) return <div className="photo-frame photo-wait" role="img" aria-label={alt} />;
  return (
    <div className="photo-frame">
      <img src={url} alt={alt} />
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
    </div>
  );
}
