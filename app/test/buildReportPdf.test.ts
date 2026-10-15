// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { jsPDF } from 'jspdf';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { allZones, STORE_850 } from '@shared/store850';
import type { Lang } from '@shared/types';
import { buildReportPdf } from '../src/pdf/buildReportPdf';
import type { PdfPhoto, PdfReport, PdfZone } from '../src/pdf/buildReportPdf';

const FONT_BASE64 = readFileSync(createRequire(import.meta.url).resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf')).toString('base64');

/** A real 1x1 JPEG; the proportions are given to the builder, not read from the image. */
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAABv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AdP/Z';
const photo = (width: number, height: number): PdfPhoto => ({ dataUrl: JPEG, width, height });
const portrait = () => photo(750, 1000);

const feedback = (over: Partial<PdfZone['feedback'][number]> = {}) => ({
  author: 'Jana Nováková', role: 'Area VM', date: '14 Oct 2026', comment: 'Doplnit velikosti', deadline: '20.10', status: 'Open', ...over,
});

function zone(over: Partial<PdfZone> = {}): PdfZone {
  return { department: "WOMEN'S DEPARTMENT", name: "Women's Wall 1", state: 'submitted', storeComment: '', photos: [], feedback: [], ...over };
}

function report(zones: PdfZone[], over: Partial<PdfReport> = {}): PdfReport {
  return {
    storeCode: '850', storeName: 'Palladium Praha', country: 'CZ', campaignName: 'Autumn 2026',
    sentAt: '14 Oct 2026', exportedAt: '15 Oct 2026', zones, ...over,
  };
}

/** All 33 zones of store 850, each with a photo and the comment `Přeskládat stůl, doplnit velikosti`. */
function fullReport(): PdfReport {
  const department = (id: string) => STORE_850.departments.find((d) => d.id === id)?.name ?? id;
  return report(allZones(STORE_850).map((z) => zone({
    department: department(z.departmentId), name: z.name, storeComment: 'Přeskládat stůl, doplnit velikosti',
    photos: [portrait(), portrait(), portrait()],
  })));
}

/**
 * Every string the builder draws, in order. jsPDF 4 creates `text` per document (it is not on the prototype), so the
 * texts are collected through the plugin event it publishes before drawing any text.
 */
let drawn: string[] = [];
/** Texts and images in the order they were drawn, with the distance of each from the top of its page. */
let trace: Array<{ kind: 'text'; text: string; y: number } | { kind: 'image'; y: number }> = [];
const collect = (payload: { text: string | string[]; y: number }) => {
  drawn.push(...[payload.text].flat());
  for (const text of [payload.text].flat()) trace.push({ kind: 'text', text, y: payload.y });
};
const API = jsPDF.API as unknown as { events: Array<[string, unknown]>; addImage: (...args: unknown[]) => unknown };

/** Position and size of every image the builder places (jsPDF copies API.addImage into each new document). */
interface Placed { x: number; y: number; w: number; h: number }
let placed: Placed[] = [];

beforeEach(() => {
  drawn = [];
  trace = [];
  placed = [];
  API.events.push(['preProcessText', collect]);
  const addImage = API.addImage;
  vi.spyOn(API, 'addImage').mockImplementation(function addImageSpy(this: unknown, ...args: unknown[]) {
    const [, , x, y, w, h] = args as [unknown, unknown, number, number, number, number];
    placed.push({ x, y, w, h });
    trace.push({ kind: 'image', y });
    return addImage.apply(this, args);
  });
});

afterEach(() => {
  API.events.splice(API.events.findIndex(([, fn]) => fn === collect), 1);
  vi.restoreAllMocks();
});

const build = (r: PdfReport, lang: Lang = 'en') => buildReportPdf(r, lang, FONT_BASE64);

describe('buildReportPdf', () => {
  test('a full report of 33 zones runs over several A4 pages with the store, zone names and store comment as text', () => {
    const doc = build(fullReport());

    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(297, 0);
    expect(drawn).toContain('850 Palladium Praha');
    expect(drawn).toContain("Women's Wall 1");
    expect(drawn).toContain('Přeskládat stůl, doplnit velikosti');
  });

  test('registers DejaVuSans, the font that has the Czech, Slovak and Romanian letters', () => {
    const doc = build(fullReport());
    expect(Object.keys(doc.getFontList())).toContain('DejaVuSans');
    expect(doc.getFont().fontName).toBe('DejaVuSans');
  });

  test('draws the header: country, campaign, sent and export dates, labelled in the user language', () => {
    build(report([]));
    expect(drawn).toEqual(expect.arrayContaining(['Country: CZ', 'Campaign: Autumn 2026', 'Sent: 14 Oct 2026', 'Exported: 15 Oct 2026']));

    drawn = [];
    build(report([]), 'cs');
    expect(drawn).toEqual(expect.arrayContaining(['Země: CZ', 'Kampaň: Autumn 2026', 'Odesláno: 14 Oct 2026', 'Exportováno: 15 Oct 2026']));
  });

  test('draws every department heading once, in order, before its zones', () => {
    build(report([
      zone({ name: "Women's Image" }), zone({ name: "Women's Wall 1" }),
      zone({ department: "MEN'S DEPARTMENT", name: "Men's Image" }),
    ]));
    expect(drawn.filter((s) => s.endsWith("S DEPARTMENT"))).toEqual(["WOMEN'S DEPARTMENT", "MEN'S DEPARTMENT"]);
    expect(drawn.indexOf("MEN'S DEPARTMENT")).toBeLessThan(drawn.indexOf("Men's Image"));
    expect(drawn.indexOf("WOMEN'S DEPARTMENT")).toBeLessThan(drawn.indexOf("Women's Image"));
  });

  test('draws the status of a zone in the user language, overdue included', () => {
    build(report([
      zone({ name: 'A', state: 'approved' }), zone({ name: 'B', state: 'overdue' }), zone({ name: 'C', state: 'not_in_campaign' }),
    ]));
    expect(drawn).toEqual(expect.arrayContaining(['Approved', 'Overdue', 'Not part of this campaign']));

    drawn = [];
    build(report([zone({ state: 'needs_correction' })]), 'ro');
    expect(drawn).toContain('De corectat');
  });

  test('draws the store comment under a label, and no label for an empty comment', () => {
    build(report([zone({ storeComment: 'Masa a fost mutată' })]), 'ro');
    expect(drawn).toEqual(expect.arrayContaining(['Comentariul magazinului', 'Masa a fost mutată']));

    drawn = [];
    build(report([zone({ storeComment: '' })]));
    expect(drawn).not.toContain('Store comment');
  });

  test('draws each feedback: author and role, date, comment, deadline and status', () => {
    build(report([zone({
      feedback: [feedback(), feedback({ author: 'Petr Dvořák', role: 'Head of VM', comment: 'Hotovo', status: 'Answered', deadline: '02.11' })],
    })]));
    expect(drawn).toEqual(expect.arrayContaining([
      'Jana Nováková · Area VM', '14 Oct 2026', 'Doplnit velikosti', 'Deadline 20.10', 'Open',
      'Petr Dvořák · Head of VM', 'Hotovo', 'Deadline 02.11', 'Answered',
    ]));
  });

  test('a zone that is not in the campaign is listed with its status and no photo', () => {
    build(report([zone({ name: "Men's Image", state: 'not_in_campaign' })]));
    expect(drawn).toEqual(expect.arrayContaining(["Men's Image", 'Not part of this campaign']));
    expect(placed).toEqual([]);
  });

  test('a photo that could not be loaded is named in a line, the others are still drawn', () => {
    build(report([zone({ photos: [portrait()], unavailablePhotos: [2] })]));
    expect(placed).toHaveLength(1);
    expect(drawn).toContain('Photo 2 could not be loaded');
  });

  test('wraps a long comment into several lines and carries it over to the next page', () => {
    const comment = 'Přeskládat stůl a doplnit všechny velikosti podle nového plánu. '.repeat(120).trim();
    const short = build(report([zone({ feedback: [feedback({ comment: 'Krátké' })] })]));
    drawn = [];
    const doc = build(report([zone({ feedback: [feedback({ comment })] })]));

    // Author and date come first on the feedback, the deadline line closes it; the comment is what lies between.
    const author = drawn.indexOf('Jana Nováková · Area VM');
    const lines = drawn.slice(author + 2, drawn.indexOf('Deadline 20.10', author));
    expect(lines.length).toBeGreaterThan(50);
    expect(lines.every((line) => line.length < 120)).toBe(true);
    expect(lines.join(' ') === comment).toBe(true);
    expect(doc.getNumberOfPages()).toBeGreaterThan(short.getNumberOfPages());
  });
});

describe('buildReportPdf photos', () => {
  const MARGIN = 15;

  test('a row of three portrait photos is 55 mm high, in proportion, side by side inside the margins', () => {
    build(report([zone({ photos: [photo(750, 1000), photo(750, 1000), photo(750, 1000)] })]));
    expect(placed).toHaveLength(3);
    for (const p of placed) {
      expect(p.h).toBeCloseTo(55, 5);
      expect(p.w).toBeCloseTo(41.25, 5);
    }
    expect(placed[0]?.x).toBeCloseTo(MARGIN, 5);
    expect(new Set(placed.map((p) => p.y)).size).toBe(1);
    expect(placed[1]!.x).toBeGreaterThan(placed[0]!.x + placed[0]!.w);
    expect(placed[2]!.x).toBeGreaterThan(placed[1]!.x + placed[1]!.w);
  });

  test('landscape photos that are too wide for the row shrink together, keeping their proportions', () => {
    build(report([zone({ photos: [photo(2000, 1000), photo(2000, 1000), photo(2000, 1000)] })]));
    const right = Math.max(...placed.map((p) => p.x + p.w));
    expect(right).toBeLessThanOrEqual(210 - MARGIN + 1e-6);
    for (const p of placed) {
      expect(p.h).toBeLessThan(55);
      expect(p.w / p.h).toBeCloseTo(2, 5);
    }
    expect(new Set(placed.map((p) => p.h.toFixed(6))).size).toBe(1);
  });

  test('a single landscape photo keeps 55 mm height when it fits', () => {
    build(report([zone({ photos: [photo(1000, 750)] })]));
    expect(placed[0]?.h).toBeCloseTo(55, 5);
    expect(placed[0]?.w).toBeCloseTo(73.3333, 3);
  });

  test('nothing is drawn below the bottom margin or off the page, however many photos and feedback', () => {
    const doc = build(fullReport());
    expect(doc.getNumberOfPages()).toBeGreaterThan(5);
    expect(placed).toHaveLength(33 * 3);
    for (const p of placed) expect(p.y + p.h).toBeLessThanOrEqual(297 - MARGIN + 1e-6);
  });

  test('a department or zone heading is never left at the bottom of a page with its photos on the next one', () => {
    let checked = 0;
    // However many zones come before a department, its heading must not end up alone at the bottom of a page.
    for (let before = 0; before < 10; before += 1) {
      trace = [];
      const zones = [
        ...Array.from({ length: before }, (_, i) => zone({ name: `Before ${i}`, photos: [portrait()], storeComment: 'Komentář. '.repeat(i) })),
        zone({ department: "MEN'S DEPARTMENT", name: 'First of men', photos: [portrait()] }),
        zone({ department: "MEN'S DEPARTMENT", name: 'Second of men', photos: [portrait()], feedback: [feedback()] }),
      ];
      build(report(zones));

      const headings = new Set(["WOMEN'S DEPARTMENT", "MEN'S DEPARTMENT", ...zones.map((z) => z.name)]);
      trace.forEach((entry, i) => {
        if (entry.kind !== 'text' || !headings.has(entry.text)) return;
        const next = trace.slice(i + 1).find((e) => e.kind === 'image');
        // On the same page the photo lies below the heading; on a later page it would lie above it.
        expect(next?.y, `${entry.text} with ${before} zones before`).toBeGreaterThan(entry.y);
        checked += 1;
      });
    }
    expect(checked).toBeGreaterThan(50);
  });
});
