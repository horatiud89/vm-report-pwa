import type { ReactNode } from 'react';
import type { PhotoRef } from '@shared/types';
import { usePhotoUrl } from '../data/hooks';

/** A square, cropped (never distorted) thumbnail of a stored photo; `children` sit on top (e.g. a remove button). */
export function PhotoThumb({ photo, alt, children }: { photo: PhotoRef; alt: string; children?: ReactNode }) {
  const url = usePhotoUrl(photo.path);
  return (
    <div className="thumb">
      {url ? <img src={url} alt={alt} /> : <div className="thumb-wait" role="img" aria-label={alt} />}
      {children}
    </div>
  );
}
