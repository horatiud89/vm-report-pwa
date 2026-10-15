import { ref, uploadBytesResumable } from 'firebase/storage';
import type { PhotoRef, ReportDoc } from '@shared/types';
import { storage } from '../firebase';

/** Storage rules accept files below 5 MB. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Second try for a photo that is still too big at the normal quality. */
const FALLBACK_QUALITY = 0.6;

/** Size that fits `max` pixels on the long side, same proportions, never larger than the original. */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  const longSide = Math.max(w, h);
  if (longSide <= max) return { width: w, height: h };
  const scale = max / longSide;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The photo could not be encoded as JPEG'))),
      'image/jpeg',
      quality,
    );
  });
}

/** Decodes with the EXIF rotation applied. A browser that rejects the option value (TypeError) applies it by default. */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (error) {
    if (error instanceof TypeError) return createImageBitmap(file);
    throw error;
  }
}

/**
 * A phone photo as an upright JPEG of at most `max` pixels on the long side. The EXIF rotation is applied when the
 * image is decoded and lost on re-encoding, so portrait photos stay upright everywhere. Always re-encoded, so any
 * format the browser can decode (HEIC on iPhone, PNG) becomes JPEG; the result is below 5 MB or this throws.
 */
export async function compressImage(file: File, max = 1920, quality = 0.8): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await decode(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot resize photos');
    ctx.fillStyle = '#ffffff'; // JPEG has no transparency
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    let blob = await encodeJpeg(canvas, quality);
    if (blob.size >= MAX_UPLOAD_BYTES) blob = await encodeJpeg(canvas, Math.min(quality, FALLBACK_QUALITY));
    if (blob.size >= MAX_UPLOAD_BYTES) throw new Error('The photo is still 5 MB or more after resizing');
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

/**
 * Resizes the photo and uploads it as `v{version}_{uuid}.jpg` in the zone folder, which is the only place the store
 * may write. `onProgress` gets the uploaded fraction (0..1). Resolves when the file is stored, so the returned
 * PhotoRef never points to a file that does not exist.
 */
export async function uploadZonePhoto(
  report: ReportDoc,
  zoneId: string,
  version: number,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<PhotoRef> {
  const { blob, width, height } = await compressImage(file);
  const path = `reports/${report.country}/${report.storeId}/${report.id}/${zoneId}/v${version}_${crypto.randomUUID()}.jpg`;
  const task = uploadBytesResumable(ref(storage, path), blob, { contentType: 'image/jpeg' });
  task.on('state_changed', (snapshot) => {
    onProgress?.(snapshot.totalBytes > 0 ? snapshot.bytesTransferred / snapshot.totalBytes : 0);
  });
  await task;
  return { path, width, height };
}
