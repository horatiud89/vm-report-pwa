import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ReportDoc } from '@shared/types';
import { compressImage, fitWithin, uploadZonePhoto } from '../src/photos/compress';

const storage = vi.hoisted(() => ({ ref: vi.fn(), uploadBytesResumable: vi.fn() }));
vi.mock('firebase/storage', () => storage);
vi.mock('../src/firebase', () => ({ storage: { name: 'storage' } }));

describe('fitWithin', () => {
  test('scales a 48 MP landscape photo down to 1920 on the long side', () => {
    expect(fitWithin(8064, 6048, 1920)).toEqual({ width: 1920, height: 1440 });
  });

  test('scales a portrait photo so the height is the long side', () => {
    expect(fitWithin(3024, 4032, 1920)).toEqual({ width: 1440, height: 1920 });
  });

  test('leaves a photo that already fits unchanged, and never scales up', () => {
    expect(fitWithin(800, 600, 1920)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1920, 1080, 1920)).toEqual({ width: 1920, height: 1080 });
  });

  test('rounds to whole pixels and keeps at least one pixel on the short side', () => {
    expect(fitWithin(4000, 3001, 1920)).toEqual({ width: 1920, height: 1440 });
    expect(fitWithin(100000, 10, 1920)).toEqual({ width: 1920, height: 1 });
  });
});

/** jsdom has no canvas or image decoding: fake the three browser pieces compressImage uses. */
function fakeBrowser(source: { width: number; height: number }, blobSizes: number[]) {
  const bitmap = { width: source.width, height: source.height, close: vi.fn() };
  const createImageBitmap = vi.fn().mockResolvedValue(bitmap);
  vi.stubGlobal('createImageBitmap', createImageBitmap);
  const ctx = { drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: '' };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  const qualities: number[] = [];
  let call = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(this: HTMLCanvasElement, cb, type, quality) {
    qualities.push(quality as number);
    expect(type).toBe('image/jpeg');
    const size = blobSizes[Math.min(call++, blobSizes.length - 1)] as number;
    cb(new Blob([new Uint8Array(size)], { type: 'image/jpeg' }));
  });
  return { bitmap, createImageBitmap, ctx, qualities };
}

const photoFile = () => new File([new Uint8Array(10)], 'IMG_0001.HEIC', { type: 'image/heic' });

describe('compressImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('decodes with the EXIF orientation applied, fits 1920 px and encodes JPEG at quality 0.8', async () => {
    const env = fakeBrowser({ width: 4032, height: 3024 }, [200_000]);
    const file = photoFile();
    const result = await compressImage(file);

    expect(env.createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1440);
    expect(result.blob.type).toBe('image/jpeg');
    expect(env.ctx.drawImage).toHaveBeenCalledWith(env.bitmap, 0, 0, 1920, 1440);
    expect(env.qualities).toEqual([0.8]);
    expect(env.bitmap.close).toHaveBeenCalled();
  });

  test('draws on a white background so a transparent image does not turn black', async () => {
    const env = fakeBrowser({ width: 100, height: 100 }, [1000]);
    await compressImage(photoFile());
    expect(env.ctx.fillStyle).toBe('#ffffff');
    expect(env.ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 100);
  });

  test('retries once at quality 0.6 when the result is 5 MB or more', async () => {
    const env = fakeBrowser({ width: 4000, height: 3000 }, [5 * 1024 * 1024, 900_000]);
    const result = await compressImage(photoFile());
    expect(env.qualities).toEqual([0.8, 0.6]);
    expect(result.blob.size).toBe(900_000);
  });

  test('fails clearly when even quality 0.6 stays at 5 MB or more', async () => {
    const env = fakeBrowser({ width: 4000, height: 3000 }, [6_000_000, 5 * 1024 * 1024]);
    await expect(compressImage(photoFile())).rejects.toThrow(/5 MB/);
    expect(env.qualities).toEqual([0.8, 0.6]);
    expect(env.bitmap.close).toHaveBeenCalled();
  });

  test('rejects a file the browser cannot decode', async () => {
    const decode = vi.fn().mockRejectedValue(new DOMException('cannot decode', 'InvalidStateError'));
    vi.stubGlobal('createImageBitmap', decode);
    await expect(compressImage(photoFile())).rejects.toThrow('cannot decode');
    expect(decode).toHaveBeenCalledTimes(1);
  });

  test('a browser that does not know the from-image option decodes without it', async () => {
    const env = fakeBrowser({ width: 800, height: 600 }, [1000]);
    env.createImageBitmap.mockRejectedValueOnce(new TypeError("'from-image' is not a valid value for imageOrientation"));
    const file = photoFile();
    const result = await compressImage(file);
    expect(env.createImageBitmap.mock.calls).toEqual([[file, { imageOrientation: 'from-image' }], [file]]);
    expect(result.width).toBe(800);
  });
});

const report: ReportDoc = {
  id: 'r1', storeId: '850', storeCode: '850', storeName: 'Palladium Praha', country: 'CZ', timezone: 'Europe/Prague',
  campaignName: 'Autumn 2026', status: 'draft', createdAt: 1, sentAt: null, seenBy: [], zoneSummary: {},
};

/** A fake upload task: reports 50 % then 100 % through state_changed and resolves like a promise. */
function fakeUploadTask() {
  return {
    on: vi.fn((_event: string, next: (s: { bytesTransferred: number; totalBytes: number }) => void) => {
      next({ bytesTransferred: 50, totalBytes: 100 });
      next({ bytesTransferred: 100, totalBytes: 100 });
    }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({}).then(resolve),
  };
}

describe('uploadZonePhoto', () => {
  beforeEach(() => {
    storage.ref.mockReset().mockImplementation((_storage: unknown, path: string) => ({ fullPath: path }));
    storage.uploadBytesResumable.mockReset().mockImplementation(() => fakeUploadTask());
    fakeBrowser({ width: 3024, height: 4032 }, [300_000]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('uploads one JPEG to the zone folder and returns its PhotoRef with the resized size', async () => {
    const photo = await uploadZonePhoto(report, 'women-image', 1, photoFile());

    expect(photo.path).toMatch(/^reports\/CZ\/850\/r1\/women-image\/v1_[0-9a-f-]{36}\.jpg$/);
    expect(photo).toEqual({ path: photo.path, width: 1440, height: 1920 });
    const [fileRef, blob, metadata] = storage.uploadBytesResumable.mock.calls[0] as [{ fullPath: string }, Blob, { contentType: string }];
    expect(fileRef.fullPath).toBe(photo.path);
    expect(blob.type).toBe('image/jpeg');
    expect(metadata).toEqual({ contentType: 'image/jpeg' });
  });

  test('gives every upload its own file name', async () => {
    const a = await uploadZonePhoto(report, 'women-image', 1, photoFile());
    const b = await uploadZonePhoto(report, 'women-image', 1, photoFile());
    expect(a.path).not.toBe(b.path);
  });

  test('reports upload progress as a fraction', async () => {
    const onProgress = vi.fn();
    await uploadZonePhoto(report, 'women-image', 1, photoFile(), onProgress);
    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([0.5, 1]);
  });

  test('a failed upload rejects, so the zone never references a missing file', async () => {
    storage.uploadBytesResumable.mockImplementation(() => ({
      on: vi.fn(),
      then: (_resolve: unknown, reject: (e: Error) => unknown) => Promise.reject(new Error('storage/unauthorized')).catch(reject),
    }));
    await expect(uploadZonePhoto(report, 'women-image', 1, photoFile())).rejects.toThrow('storage/unauthorized');
  });
});
