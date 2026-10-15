import type { Stroke } from '@shared/types';
import { usePhotoUrl } from '../data/hooks';
import { StrokeLayer } from './StrokeLayer';

/**
 * A stored photo at its natural proportions (never cropped) with the reviewer's strokes drawn over it.
 */
export function PhotoWithStrokes({ path, strokes, alt = '' }: { path: string; strokes: Stroke[]; alt?: string }) {
  const url = usePhotoUrl(path);
  if (!url) return <div className="photo-frame photo-wait" role="img" aria-label={alt} />;
  return (
    <div className="photo-frame">
      <img src={url} alt={alt} />
      <StrokeLayer strokes={strokes} />
    </div>
  );
}
