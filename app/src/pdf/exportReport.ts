import { collection, getDocs } from 'firebase/firestore';
import { getBlob, ref } from 'firebase/storage';
import fontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import { ROLE_LABEL } from '@shared/access';
import { formatDayMonth } from '@shared/dates';
import { t } from '@shared/i18n';
import type { FeedbackDoc, Lang, ReportDoc, StoreDef, Stroke, ZoneDoc } from '@shared/types';
import { db, storage } from '../firebase';
import { formatDate } from '../i18n/formatDate';
import { fitWithin } from '../photos/compress';
import { shownState } from '../store/zoneBadge';
// Types only: the builder (and with it jsPDF) is loaded when an export starts, not with the app.
import type { PdfFeedback, PdfPhoto, PdfReport, PdfZone } from './buildReportPdf';
import { drawStrokes } from './drawStrokes';

/** Long side of a photo in the PDF, in pixels: sharp enough on paper, small enough for a few MB per report. */
const PHOTO_MAX_SIDE = 1000;
const PHOTO_QUALITY = 0.7;
/** Photos fetched and drawn at the same time. */
const PHOTO_PARALLEL = 4;

/** `VM-Report-{store}-{campaign}.pdf` with only letters, digits, `_` and `-` from the names (accents dropped). */
export function pdfFileName(storeCode: string, campaignName: string): string {
  const safe = (name: string) => name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `VM-Report-${safe(storeCode) || 'store'}-${safe(campaignName) || 'campaign'}.pdf`;
}

/** Every feedback of a zone, newest first. */
async function loadFeedback(reportId: string, zoneId: string): Promise<FeedbackDoc[]> {
  const snap = await getDocs(collection(db, 'reports', reportId, 'zones', zoneId, 'feedback'));
  return snap.docs
    .map((d) => ({ ...d.data(), id: d.id }) as FeedbackDoc)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** `fn` over `items`, at most `limit` at a time; results in the order of `items`. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** The stored photo with the strokes drawn on it, at most 1000 px on the long side, as a JPEG data URL. */
async function renderPhoto(path: string, strokes: Stroke[]): Promise<PdfPhoto> {
  const blob = await getBlob(ref(storage, path));
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_SIDE);
    if (width < 1 || height < 1) throw new Error('The photo has no size');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw on photos');
    ctx.fillStyle = '#ffffff'; // JPEG has no transparency
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    drawStrokes(ctx, strokes, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
    // A browser without JPEG output answers with PNG, which the PDF would then take for a broken JPEG.
    if (!dataUrl.startsWith('data:image/jpeg')) throw new Error('This browser cannot encode JPEG');
    return { dataUrl, width, height };
  } finally {
    bitmap.close();
    canvas.width = 0; // gives the pixel memory back; phones allow little of it
    canvas.height = 0;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** DejaVuSans.ttf, fetched only when a PDF is made (it is about 750 kB). */
async function loadFontBase64(): Promise<string> {
  const response = await fetch(fontUrl);
  if (!response.ok) throw new Error(`The PDF font could not be loaded (${response.status})`);
  return bytesToBase64(new Uint8Array(await response.arrayBuffer()));
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A PDF that is ready, to be shared from a new tap of the reviewer (see deliver). Never rejects. */
export type ShareLater = () => Promise<void>;

const errorName = (error: unknown) => (error as { name?: string } | null)?.name;

/**
 * The share sheet (on iPhone: save to Files, AirDrop, Mail…) when the browser can share files, else a download.
 * The reviewer closing the sheet is not an error. WebKit shares only within moments of a tap and making the PDF
 * takes longer, so a share refused for that (NotAllowedError, or no activation left) is handed back as ShareLater,
 * to be called from a new tap. A share that fails for any other reason ends in a download.
 */
async function deliver(blob: Blob, fileName: string, title: string): Promise<ShareLater | null> {
  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (!navigator.canShare?.({ files: [file] })) {
    download(file);
    return null;
  }
  const shareLater: ShareLater = async () => {
    try {
      await navigator.share({ files: [file], title });
    } catch (error) {
      if (errorName(error) !== 'AbortError') download(file);
    }
  };
  // Not in every browser's DOM; where it is missing, the share itself says whether it was allowed.
  if ((navigator.userActivation as UserActivation | undefined)?.isActive === false) return shareLater;
  try {
    await navigator.share({ files: [file], title });
  } catch (error) {
    if (errorName(error) === 'NotAllowedError') return shareLater;
    if (errorName(error) !== 'AbortError') download(file);
  }
  return null;
}

/**
 * Makes the PDF of a report and hands it to the reviewer. For every zone it reads all feedback (every version, newest
 * first), fetches the current photos and draws on each the circles of the feedback given on this version (circles
 * of an older version belong to photos that are no longer current), then builds the document and shares or downloads
 * it. A photo that cannot be loaded is named in the PDF and does not stop it; anything else that fails (feedback,
 * font, the PDF itself) rejects, so the caller can say so. Resolves with a ShareLater when the browser wants a new
 * tap before it shares the PDF, else with null.
 * `store` only gives the department names; without it a department is shown by its id.
 */
export async function exportReport(
  report: ReportDoc,
  zones: ZoneDoc[],
  lang: Lang,
  store: StoreDef | null = null,
): Promise<ShareLater | null> {
  const exportedAt = Date.now();
  const ordered = [...zones].sort((a, b) => a.order - b.order);
  // A zone that is not in the campaign has no photos to show; the others show their current version.
  const versionOf = (zone: ZoneDoc) => (zone.state === 'not_in_campaign' ? undefined : zone.versions.at(-1));

  const feedbackOf = await Promise.all(ordered.map((zone) => (versionOf(zone) ? loadFeedback(report.id, zone.id) : [])));

  const photoJobs = ordered.flatMap((zone, zoneIndex) => (versionOf(zone)?.photos ?? []).map((photo, photoIndex) => ({
    zoneIndex,
    photoIndex,
    path: photo.path,
    strokes: (feedbackOf[zoneIndex] ?? [])
      .filter((f) => f.version === versionOf(zone)?.n && f.photoIndex === photoIndex)
      .flatMap((f) => f.strokes),
  })));

  const [rendered, buildModule, fontBase64] = await Promise.all([
    mapLimit(photoJobs, PHOTO_PARALLEL, (job) => renderPhoto(job.path, job.strokes).catch(() => null)),
    import('./buildReportPdf'),
    loadFontBase64(),
  ]);

  const pdfZones = ordered.map((zone, zoneIndex): PdfZone => {
    const version = versionOf(zone);
    const photos: PdfPhoto[] = [];
    const unavailablePhotos: number[] = [];
    photoJobs.forEach((job, i) => {
      if (job.zoneIndex !== zoneIndex) return;
      const photo = rendered[i];
      if (photo) photos.push(photo);
      else unavailablePhotos.push(job.photoIndex + 1);
    });
    return {
      department: store?.departments.find((d) => d.id === zone.departmentId)?.name ?? zone.departmentId.toUpperCase(),
      name: zone.name,
      state: shownState(zone.state, zone.earliestOpenDeadline, report.timezone, exportedAt),
      storeComment: version?.storeComment ?? '',
      photos,
      unavailablePhotos,
      feedback: (feedbackOf[zoneIndex] ?? []).map((f): PdfFeedback => ({
        author: f.authorName,
        role: ROLE_LABEL[f.authorRole],
        date: formatDate(lang, f.createdAt, report.timezone),
        comment: f.comment,
        deadline: formatDayMonth(f.deadline),
        status: t(lang, f.status === 'open' ? 'review.statusOpen' : 'review.statusAnswered'),
        // Which photos it was about only matters once the zone has had more than one.
        ...(zone.versions.length > 1 && { version: f.version }),
      })),
    };
  });

  const pdfReport: PdfReport = {
    storeCode: report.storeCode,
    storeName: report.storeName,
    country: report.country,
    campaignName: report.campaignName,
    sentAt: formatDate(lang, report.sentAt ?? report.createdAt, report.timezone),
    exportedAt: formatDate(lang, exportedAt, report.timezone),
    zones: pdfZones,
  };

  const doc = buildModule.buildReportPdf(pdfReport, lang, fontBase64);
  return deliver(doc.output('blob'), pdfFileName(report.storeCode, report.campaignName), `VM Photo Report ${report.storeCode} – ${report.campaignName}`);
}
