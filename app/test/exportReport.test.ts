import { getDocs } from 'firebase/firestore';
import { getBlob } from 'firebase/storage';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { STORE_850 } from '@shared/store850';
import type { FeedbackDoc, Lang, PhotoRef, ZoneDoc } from '@shared/types';
import { buildReportPdf } from '../src/pdf/buildReportPdf';
import type { PdfReport } from '../src/pdf/buildReportPdf';
import { exportReport, pdfFileName } from '../src/pdf/exportReport';
import { makeReport, makeZone } from './fixtures';

vi.mock('../src/firebase', () => ({ db: { name: 'db' }, storage: { name: 'storage' } }));
vi.mock('firebase/firestore', () => ({ collection: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })), getDocs: vi.fn() }));
vi.mock('firebase/storage', () => ({ ref: vi.fn((_storage: unknown, path: string) => ({ fullPath: path })), getBlob: vi.fn() }));
vi.mock('../src/pdf/buildReportPdf', () => ({ buildReportPdf: vi.fn() }));

/** 15 Oct 2026, noon in Prague. */
const NOW = Date.UTC(2026, 9, 15, 10);
const SENT = Date.UTC(2026, 9, 14, 8);

const report = () => makeReport({ status: 'sent', sentAt: SENT });

const path = (zoneId: string, n: number, version = 1) => `reports/CZ/850/r1/${zoneId}/v${version}_${n}.jpg`;
const photoRef = (zoneId: string, n: number, version = 1): PhotoRef => ({ path: path(zoneId, n, version), width: 1920, height: 1440 });

function feedbackDoc(over: Partial<FeedbackDoc> & { id: string }): FeedbackDoc {
  return {
    authorUid: 'u2', authorRole: 'avm', authorName: 'Jana Nováková', version: 1, photoIndex: 0, comment: 'Doplnit velikosti',
    strokes: [], deadline: '2026-10-20', createdAt: Date.UTC(2026, 9, 14, 12), status: 'open', ...over,
  };
}

/** What each zone's feedback collection holds, by zone id. */
let feedback: Record<string, FeedbackDoc[]> = {};

/** Canvas stand-ins: what was drawn is written into the JPEG "data URL" so a test can read it back from the PDF input. */
interface DrawnCanvas { source: string; width: number; height: number; moves: Array<[number, number]>; dots: number }
const decode = (dataUrl: string): DrawnCanvas => JSON.parse(atob(dataUrl.split(',')[1] as string)) as DrawnCanvas;

function fakeBrowser(failing: string[] = []) {
  vi.mocked(getBlob).mockImplementation(async (ref) => {
    const fullPath = (ref as unknown as { fullPath: string }).fullPath;
    if (failing.includes(fullPath)) throw new Error('storage/unauthorized');
    return { fullPath } as unknown as Blob;
  });
  vi.stubGlobal('createImageBitmap', vi.fn(async (blob: { fullPath: string }) => ({ width: 1920, height: 1440, fullPath: blob.fullPath, close: vi.fn() })));
  const drawn = new WeakMap<HTMLCanvasElement, DrawnCanvas>();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function getContext(this: HTMLCanvasElement) {
    const state: DrawnCanvas = { source: '', width: this.width, height: this.height, moves: [], dots: 0 };
    drawn.set(this, state);
    return {
      fillRect: vi.fn(), beginPath: vi.fn(), stroke: vi.fn(), lineTo: vi.fn(), fill: vi.fn(),
      drawImage: (bitmap: { fullPath: string }) => { state.source = bitmap.fullPath; },
      moveTo: (x: number, y: number) => { state.moves.push([x, y]); },
      arc: () => { state.dots += 1; },
    } as unknown as CanvasRenderingContext2D;
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function toDataURL(this: HTMLCanvasElement, type?: string, quality?: number) {
    expect(type).toBe('image/jpeg');
    expect(quality).toBe(0.7);
    const state = drawn.get(this) as DrawnCanvas;
    return `data:image/jpeg;base64,${btoa(JSON.stringify({ ...state, width: this.width, height: this.height }))}`;
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer })));
}

const PDF_BLOB = new Blob(['%PDF-1.3'], { type: 'application/pdf' });

function setSharing(share: ((data: ShareData) => Promise<void>) | undefined, canShare: boolean) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
  Object.defineProperty(navigator, 'canShare', { value: share ? vi.fn(() => canShare) : undefined, configurable: true, writable: true });
}

/** The report the builder was given in the last export, and the language and font it was given with it. */
function built() {
  const [pdfReport, lang, font] = vi.mocked(buildReportPdf).mock.calls.at(-1) as [PdfReport, Lang, string];
  return { pdfReport, lang, font };
}

const zonesOf = (...zones: ZoneDoc[]) => zones;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  feedback = {};
  vi.mocked(getDocs).mockImplementation((async (q: { path: string }) => {
    const zoneId = q.path.split('/')[3] as string;
    return { docs: (feedback[zoneId] ?? []).map((f) => ({ id: f.id, data: () => { const { id: _id, ...rest } = f; return rest; } })) };
  }) as never);
  vi.mocked(buildReportPdf).mockReset().mockReturnValue({ output: vi.fn(() => PDF_BLOB) } as never);
  fakeBrowser();
  setSharing(undefined, false);
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => 'blob:pdf');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('exportReport: what goes into the PDF', () => {
  test('gives the builder the header, the language and the font as base64', async () => {
    await exportReport(report(), zonesOf(), 'cs');
    const { pdfReport, lang, font } = built();
    expect(lang).toBe('cs');
    expect(font).toBe('AQID');
    expect(pdfReport).toMatchObject({
      storeCode: '850', storeName: 'Palladium Praha', country: 'CZ', campaignName: 'Autumn 2026', zones: [],
    });
  });

  test('writes the sent date and the export date as the day it was in the time zone of the store, in the user language', async () => {
    await exportReport(makeReport({ status: 'sent', sentAt: Date.UTC(2026, 9, 14, 22, 30) }), zonesOf(), 'en');
    expect(built().pdfReport).toMatchObject({ sentAt: '15 Oct 2026', exportedAt: '15 Oct 2026' });

    await exportReport(report(), zonesOf(), 'en');
    expect(built().pdfReport).toMatchObject({ sentAt: '14 Oct 2026', exportedAt: '15 Oct 2026' });
  });

  test('a report that has no sent date yet is dated by its creation', async () => {
    await exportReport(makeReport({ status: 'draft', sentAt: null, createdAt: Date.UTC(2026, 9, 1, 8) }), zonesOf(), 'en');
    expect(built().pdfReport.sentAt).toBe('1 Oct 2026');
  });

  test('lists the zones in order with department, name, state and the store comment of the latest version', async () => {
    const wall = makeZone('women-wall-1', {
      state: 'submitted', order: 2,
      versions: [
        { n: 1, photos: [photoRef('women-wall-1', 0)], storeComment: 'old', createdAt: 1 },
        { n: 2, photos: [photoRef('women-wall-1', 0, 2)], storeComment: 'Přeskládat stůl', createdAt: 2 },
      ],
    });
    const image = makeZone('women-image', { state: 'approved', order: 1, versions: [{ n: 1, photos: [photoRef('women-image', 0)], storeComment: '', createdAt: 1 }] });
    await exportReport(report(), zonesOf(wall, image), 'en', STORE_850);

    const { zones } = built().pdfReport;
    expect(zones.map((z) => [z.department, z.name, z.state, z.storeComment])).toEqual([
      ["WOMEN'S DEPARTMENT", "Women's Image", 'approved', ''],
      ["WOMEN'S DEPARTMENT", "Women's Wall 1", 'submitted', 'Přeskládat stůl'],
    ]);
  });

  test('without the store definition a department is named by its id', async () => {
    await exportReport(report(), zonesOf(makeZone('men-image', { state: 'approved', versions: [{ n: 1, photos: [photoRef('men-image', 0)], storeComment: '', createdAt: 1 }] })), 'en');
    expect(built().pdfReport.zones[0]?.department).toBe('MEN');
  });

  test('a correction past its deadline is exported as overdue, a deadline today is not', async () => {
    const overdue = makeZone('women-image', { state: 'needs_correction', earliestOpenDeadline: '2026-10-14' });
    const today = makeZone('men-image', { state: 'needs_correction', earliestOpenDeadline: '2026-10-15' });
    await exportReport(report(), zonesOf(overdue, today), 'en');
    expect(built().pdfReport.zones.map((z) => z.state)).toEqual(['overdue', 'needs_correction']);
  });

  test('a zone that is not in the campaign is listed with its state, without photos, comment or feedback', async () => {
    const zone = makeZone('men-image', { state: 'not_in_campaign', versions: [{ n: 1, photos: [], storeComment: 'ignored', createdAt: 1 }] });
    feedback['men-image'] = [feedbackDoc({ id: 'f1' })];
    await exportReport(report(), zonesOf(zone), 'en');

    expect(built().pdfReport.zones).toEqual([expect.objectContaining({ name: "Men's Image", state: 'not_in_campaign', storeComment: '', photos: [], feedback: [] })]);
    expect(getDocs).not.toHaveBeenCalled();
    expect(getBlob).not.toHaveBeenCalled();
  });
});

describe('exportReport: feedback', () => {
  const zone = () => makeZone('women-wall-1', {
    state: 'needs_correction',
    versions: [
      { n: 1, photos: [photoRef('women-wall-1', 0)], storeComment: '', createdAt: 1 },
      { n: 2, photos: [photoRef('women-wall-1', 0, 2)], storeComment: '', createdAt: 2 },
    ],
  });

  test('has the feedback of the latest version only, newest first, with author, role, date, comment, deadline and status', async () => {
    feedback['women-wall-1'] = [
      feedbackDoc({ id: 'old-version', version: 1, comment: 'about the first photos', createdAt: 1 }),
      feedbackDoc({ id: 'first', version: 2, comment: 'first', createdAt: Date.UTC(2026, 9, 14, 9), status: 'answered', authorName: 'Petr Dvořák', authorRole: 'head_vm', deadline: '2026-11-02' }),
      feedbackDoc({ id: 'second', version: 2, comment: 'second', createdAt: Date.UTC(2026, 9, 15, 8) }),
    ];
    await exportReport(report(), zonesOf(zone()), 'en');

    expect(built().pdfReport.zones[0]?.feedback).toEqual([
      { author: 'Jana Nováková', role: 'Area VM', date: '15 Oct 2026', comment: 'second', deadline: '20.10', status: 'Open' },
      { author: 'Petr Dvořák', role: 'Head of VM', date: '14 Oct 2026', comment: 'first', deadline: '02.11', status: 'Answered' },
    ]);
  });

  test('writes the status in the user language, and keeps the role in English', async () => {
    feedback['women-wall-1'] = [feedbackDoc({ id: 'f1', version: 2, authorRole: 'director' })];
    await exportReport(report(), zonesOf(zone()), 'ro');
    expect(built().pdfReport.zones[0]?.feedback[0]).toMatchObject({ role: 'Director of Operations', status: 'Deschis' });
  });

  test('a feedback without a comment is still listed', async () => {
    feedback['women-wall-1'] = [feedbackDoc({ id: 'f1', version: 2, comment: '' })];
    await exportReport(report(), zonesOf(zone()), 'en');
    expect(built().pdfReport.zones[0]?.feedback).toHaveLength(1);
  });

  test('fails when the feedback cannot be read, so no PDF with missing feedback is handed out', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('permission-denied'));
    const share = vi.fn(async (_data: ShareData) => undefined);
    setSharing(share, true);
    await expect(exportReport(report(), zonesOf(zone()), 'en')).rejects.toThrow('permission-denied');
    expect(buildReportPdf).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  });
});

describe('exportReport: photos', () => {
  const zone = () => makeZone('women-wall-1', {
    state: 'needs_correction',
    versions: [{ n: 1, photos: [photoRef('women-wall-1', 0), photoRef('women-wall-1', 1), photoRef('women-wall-1', 2)], storeComment: '', createdAt: 1 }],
  });
  const square = (points: number[]) => ({ points });

  test('scales each photo to at most 1000 px on the long side and encodes it as JPEG', async () => {
    await exportReport(report(), zonesOf(zone()), 'en');
    const photos = built().pdfReport.zones[0]?.photos ?? [];
    expect(photos).toHaveLength(3);
    for (const photo of photos) {
      expect(photo).toMatchObject({ width: 1000, height: 750 });
      expect(photo.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    }
    expect(photos.map((p) => decode(p.dataUrl).source)).toEqual([path('women-wall-1', 0), path('women-wall-1', 1), path('women-wall-1', 2)]);
  });

  test('draws the strokes of the feedback on the photo they belong to, from every feedback of the latest version', async () => {
    feedback['women-wall-1'] = [
      feedbackDoc({ id: 'a', photoIndex: 1, strokes: [square([0.1, 0.1, 0.2, 0.2])] }),
      feedbackDoc({ id: 'b', photoIndex: 1, strokes: [square([0.5, 0.5, 0.6, 0.6]), square([0.8, 0.8, 0.8, 0.8])] }),
      feedbackDoc({ id: 'c', photoIndex: 0, strokes: [square([0.3, 0.3, 0.4, 0.4])] }),
      feedbackDoc({ id: 'old', version: 0, photoIndex: 2, strokes: [square([0.9, 0.9, 0.95, 0.95])] }),
    ];
    await exportReport(report(), zonesOf(zone()), 'en');

    const [first, second, third] = (built().pdfReport.zones[0]?.photos ?? []).map((p) => decode(p.dataUrl));
    expect(first?.moves).toEqual([[300, 225]]);
    expect(second?.moves).toHaveLength(2);
    expect(second?.dots).toBe(1);
    expect(third?.moves).toEqual([]);
    expect(third?.dots).toBe(0);
  });

  test('a photo that cannot be loaded is named as unavailable, the others are still in the PDF and the PDF is still delivered', async () => {
    fakeBrowser([path('women-wall-1', 1)]);
    const share = vi.fn(async (_data: ShareData) => undefined);
    setSharing(share, true);
    await exportReport(report(), zonesOf(zone()), 'en');

    const [z] = built().pdfReport.zones;
    expect(z?.photos.map((p) => decode(p.dataUrl).source)).toEqual([path('women-wall-1', 0), path('women-wall-1', 2)]);
    expect(z?.unavailablePhotos).toEqual([2]);
    expect(share).toHaveBeenCalledTimes(1);
  });

  test('a photo the browser cannot decode or draw is unavailable too, and so is one that does not come out as JPEG', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn()
      .mockRejectedValueOnce(new Error('cannot decode'))
      .mockImplementation(async (blob: { fullPath: string }) => ({ width: 1920, height: 1440, fullPath: blob.fullPath, close: vi.fn() })));
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockRestore();
    let call = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => (call++ === 0 ? 'data:image/png;base64,AAAA' : 'data:image/jpeg;base64,AAAA'));
    await exportReport(report(), zonesOf(zone()), 'en');

    const [z] = built().pdfReport.zones;
    expect(z?.photos).toHaveLength(1);
    expect(z?.unavailablePhotos).toEqual([1, 2]);
  });

  test('every photo is closed after drawing, and its canvas released', async () => {
    const bitmaps: Array<{ close: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal('createImageBitmap', vi.fn(async (blob: { fullPath: string }) => {
      const bitmap = { width: 1920, height: 1440, fullPath: blob.fullPath, close: vi.fn() };
      bitmaps.push(bitmap);
      return bitmap;
    }));
    await exportReport(report(), zonesOf(zone()), 'en');
    expect(bitmaps).toHaveLength(3);
    for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  test('a photo smaller than 1000 px is not enlarged', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async (blob: { fullPath: string }) => ({ width: 600, height: 800, fullPath: blob.fullPath, close: vi.fn() })));
    await exportReport(report(), zonesOf(zone()), 'en');
    expect(built().pdfReport.zones[0]?.photos[0]).toMatchObject({ width: 600, height: 800 });
  });
});

describe('exportReport: delivery', () => {
  const file = (share: { mock: { calls: unknown[][] } }) => (share.mock.calls[0] as [ShareData])[0].files?.[0] as File;

  test('opens the share sheet with the PDF file when the browser can share files', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    setSharing(share, true);
    await exportReport(report(), zonesOf(), 'en');

    expect(share).toHaveBeenCalledTimes(1);
    const pdf = file(share);
    expect(pdf.name).toBe('VM-Report-850-Autumn-2026.pdf');
    expect(pdf.type).toBe('application/pdf');
    expect(pdf.size).toBe(PDF_BLOB.size);
    expect((share.mock.calls[0] as [ShareData])[0].title).toContain('850');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  test('downloads the file when the browser cannot share files', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    setSharing(share, false);
    const anchors: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) { anchors.push(this); });
    await exportReport(report(), zonesOf(), 'en');

    expect(share).not.toHaveBeenCalled();
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.download).toBe('VM-Report-850-Autumn-2026.pdf');
    expect(anchors[0]?.href).toBe('blob:pdf');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  test('downloads the file when the browser has no share at all', async () => {
    setSharing(undefined, false);
    await exportReport(report(), zonesOf(), 'en');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  test('the reviewer closing the share sheet is not an error and downloads nothing', async () => {
    setSharing(vi.fn(async () => { throw new DOMException('Share canceled', 'AbortError'); }), true);
    await expect(exportReport(report(), zonesOf(), 'en')).resolves.toBeUndefined();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  test('a share the browser refuses (for instance because the tap was too long ago) falls back to a download', async () => {
    setSharing(vi.fn(async () => { throw new DOMException('Must be handling a user gesture', 'NotAllowedError'); }), true);
    await expect(exportReport(report(), zonesOf(), 'en')).resolves.toBeUndefined();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  test('fails when the PDF cannot be built', async () => {
    vi.mocked(buildReportPdf).mockImplementation(() => { throw new Error('bad font'); });
    await expect(exportReport(report(), zonesOf(), 'en')).rejects.toThrow('bad font');
  });

  test('fails when the font cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(exportReport(report(), zonesOf(), 'en')).rejects.toThrow();
    expect(buildReportPdf).not.toHaveBeenCalled();
  });
});

describe('pdfFileName', () => {
  test('is VM-Report-{store}-{campaign}.pdf', () => {
    expect(pdfFileName('850', 'Autumn 2026')).toBe('VM-Report-850-Autumn-2026.pdf');
  });

  test('keeps only safe file name characters: accents are dropped, anything else becomes a dash', () => {
    expect(pdfFileName('850', 'Podzim 2026 – Děti / Žena')).toBe('VM-Report-850-Podzim-2026-Deti-Zena.pdf');
    expect(pdfFileName('850', 'Toamnă: ȘTEFAN & ȚARA')).toBe('VM-Report-850-Toamna-STEFAN-TARA.pdf');
    expect(pdfFileName('850', '../../etc/passwd')).toBe('VM-Report-850-etc-passwd.pdf');
    expect(pdfFileName('850', 'a"b*c?d<e>f|g\\h:i')).toBe('VM-Report-850-a-b-c-d-e-f-g-h-i.pdf');
  });

  test('has no leading, trailing or doubled dashes, and falls back when nothing is left', () => {
    expect(pdfFileName('850', '  --Sale!!  ')).toBe('VM-Report-850-Sale.pdf');
    expect(pdfFileName('850', '***')).toBe('VM-Report-850-campaign.pdf');
    expect(pdfFileName('', 'Sale')).toBe('VM-Report-store-Sale.pdf');
  });

  test('stays short for a very long campaign name', () => {
    expect(pdfFileName('850', 'x'.repeat(300)).length).toBeLessThanOrEqual('VM-Report-850-.pdf'.length + 60);
  });
});
