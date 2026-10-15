import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { MAX_PHOTOS } from '@shared/status';
import { useT } from '../i18n/I18nProvider';

interface Props {
  /** Photos in the zone plus photos still uploading. */
  count: number;
  /** Nothing can be added (e.g. the zone is marked not part of the campaign). */
  disabled?: boolean;
  /** Called with the one file the user took or chose; resizing and uploading are the caller's job. */
  onPick: (file: File) => void;
}

/** "Add photo (n/3)" with the two ways to add one: the camera, or the phone's gallery. */
export function PhotoPicker({ count, disabled = false, onPick }: Props) {
  const { t } = useT();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const blocked = disabled || count >= MAX_PHOTOS;

  function picked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so that choosing the same file again (after a failed upload) still fires a change.
    event.target.value = '';
    if (file) onPick(file);
  }

  return (
    <div className="photo-picker">
      <p className="photo-picker-label">{t('store.addPhoto', { n: count })}</p>
      <div className="photo-picker-buttons">
        <button type="button" className="btn" disabled={blocked} onClick={() => camera.current?.click()}>
          {t('store.takePhoto')}
        </button>
        <button type="button" className="btn" disabled={blocked} onClick={() => gallery.current?.click()}>
          {t('store.choosePhoto')}
        </button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden tabIndex={-1} onChange={picked} />
      <input ref={gallery} type="file" accept="image/*" hidden tabIndex={-1} onChange={picked} />
    </div>
  );
}
