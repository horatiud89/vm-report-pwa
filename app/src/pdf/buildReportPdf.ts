import { jsPDF } from 'jspdf';
import { stateLabel, t } from '@shared/i18n';
import type { Country, Lang, ZoneState } from '@shared/types';
import { BADGE_STYLE } from '../ui/badgeStyle';

/** A photo as a JPEG data URL with the reviewer's circles already drawn on it, and its size in pixels. */
export interface PdfPhoto { dataUrl: string; width: number; height: number }

export interface PdfFeedback {
  /** Name only; the role follows it in the line. */
  author: string;
  role: string;
  /** Already written out in the user's language. */
  date: string;
  comment: string;
  /** dd.MM */
  deadline: string;
  /** The Open / Answered label in the user's language. */
  status: string;
  /** Which version of the zone's photos it was given on; set only for a zone that has more than one version. */
  version?: number;
}

export interface PdfZone {
  department: string;
  name: string;
  state: ZoneState | 'overdue';
  storeComment: string;
  photos: PdfPhoto[];
  /** 1-based numbers of photos that could not be loaded; each gets a short line instead of a picture. */
  unavailablePhotos?: number[];
  feedback: PdfFeedback[];
}

export interface PdfReport {
  storeCode: string;
  storeName: string;
  country: Country;
  campaignName: string;
  sentAt: string;
  exportedAt: string;
  zones: PdfZone[];
}

/** Name the font is registered under; it has the Czech, Slovak and Romanian letters, which the built-in fonts lack. */
const FONT = 'DejaVuSans';

const PAGE_HEIGHT = 297;
const MARGIN = 15;
const RIGHT = 210 - MARGIN;
const CONTENT_WIDTH = RIGHT - MARGIN;
const BOTTOM = PAGE_HEIGHT - MARGIN;
/** Space on an empty page; a block taller than this cannot be kept in one piece. */
const PAGE_ROOM = BOTTOM - MARGIN;

const PHOTO_HEIGHT = 55;
const PHOTO_GAP = 3;
const PHOTOS_PER_ROW = 3;
const FEEDBACK_INDENT = 4;

type Rgb = [number, number, number];
const INK: Rgb = [0, 0, 0];
const MUTED: Rgb = [96, 96, 96];
const RULE: Rgb = [200, 200, 200];

const MM_PER_PT = 25.4 / 72;
const lineHeight = (pt: number) => pt * MM_PER_PT * 1.35;

/** Where the page is being written: the document and the distance of the next line from the top edge. */
interface Cursor { doc: jsPDF; y: number }

/** Starts a new page when `height` does not fit in what is left of this one. */
function ensureRoom(c: Cursor, height: number): void {
  if (c.y + height > BOTTOM) {
    c.doc.addPage();
    c.y = MARGIN;
  }
}

/** Like `ensureRoom`, but a block that would not fit on a whole page anyway is left to flow from here. */
function keepTogether(c: Cursor, height: number): void {
  if (height <= PAGE_ROOM) ensureRoom(c, height);
}

interface TextStyle { size: number; color?: Rgb; x?: number; right?: string }

/** One line of text with the top of its box at the cursor, plus `right` aligned to the right margin; moves the cursor below it. */
function textLine(c: Cursor, text: string, { size, color = INK, x = MARGIN, right }: TextStyle): void {
  const height = lineHeight(size);
  ensureRoom(c, height);
  const baseline = c.y + height * 0.75;
  c.doc.setFontSize(size);
  c.doc.setTextColor(...color);
  c.doc.text(text, x, baseline);
  if (right) c.doc.text(right, RIGHT, baseline, { align: 'right' });
  c.y += height;
}

/** `text` broken into lines that fit `width` at this size. Measured with the font in use, so the size is set first. */
function wrap(c: Cursor, text: string, size: number, width: number): string[] {
  c.doc.setFontSize(size);
  return c.doc.splitTextToSize(text, width) as string[];
}

function hexToRgb(value: unknown, fallback: Rgb): Rgb {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
}

/** The zone status as in the app's badge (the only colour of the report), right-aligned at the margin on a line of height `lineH`. */
function statusChip(c: Cursor, state: ZoneState | 'overdue', label: string, lineH: number): void {
  const style = BADGE_STYLE[state];
  const size = 8.5;
  const height = 5;
  const doc = c.doc;
  doc.setFontSize(size);
  const width = doc.getTextWidth(label) + 4;
  const x = RIGHT - width;
  const top = c.y + (lineH - height) / 2;
  doc.setFillColor(...hexToRgb(style.backgroundColor, [255, 255, 255]));
  doc.setDrawColor(...hexToRgb(style.borderColor, INK));
  doc.setLineWidth(0.25);
  doc.roundedRect(x, top, width, height, 1.2, 1.2, 'FD');
  doc.setTextColor(...hexToRgb(style.color, INK));
  doc.text(label, x + 2, top + height / 2 + size * MM_PER_PT * 0.35);
}

/** Row of up to three photos at 55 mm height, or all at one smaller height when they would be wider than the page. */
function rowLayout(photos: PdfPhoto[]): { height: number; widths: number[] } {
  const natural = photos.map((p) => (p.width > 0 && p.height > 0 ? PHOTO_HEIGHT * (p.width / p.height) : PHOTO_HEIGHT));
  const room = CONTENT_WIDTH - (photos.length - 1) * PHOTO_GAP;
  const scale = Math.min(1, room / natural.reduce((sum, w) => sum + w, 0));
  return { height: PHOTO_HEIGHT * scale, widths: natural.map((w) => w * scale) };
}

function photoRows(photos: PdfPhoto[]): PdfPhoto[][] {
  const rows: PdfPhoto[][] = [];
  for (let i = 0; i < photos.length; i += PHOTOS_PER_ROW) rows.push(photos.slice(i, i + PHOTOS_PER_ROW));
  return rows;
}

const PHOTO_ROW_SPACE = 2;
const ZONE_HEADING_SIZE = 11;
const DEPARTMENT_SIZE = 13;
const DEPARTMENT_SPACE_BEFORE = 4;

function drawPhotoRow(c: Cursor, row: PdfPhoto[]): void {
  const { height, widths } = rowLayout(row);
  ensureRoom(c, height);
  let x = MARGIN;
  row.forEach((photo, i) => {
    c.doc.addImage(photo.dataUrl, 'JPEG', x, c.y, widths[i] as number, height);
    x += (widths[i] as number) + PHOTO_GAP;
  });
  c.y += height + PHOTO_ROW_SPACE;
}

function drawFeedback(c: Cursor, f: PdfFeedback, lang: Lang): void {
  const width = CONTENT_WIDTH - FEEDBACK_INDENT;
  const comment = f.comment ? wrap(c, f.comment, 10, width) : [];
  const versionHeight = f.version === undefined ? 0 : lineHeight(8);
  const height = versionHeight + lineHeight(9) * 2 + comment.length * lineHeight(10) + 2.5;
  keepTogether(c, height);
  const top = c.y;
  const page = c.doc.getCurrentPageInfo().pageNumber;
  const x = MARGIN + FEEDBACK_INDENT;

  if (f.version !== undefined) textLine(c, t(lang, 'pdf.version', { n: f.version }), { size: 8, color: MUTED, x });
  // A demo account is named after its role ("Head of VM"): the role is then not written twice.
  textLine(c, f.role === f.author ? f.author : `${f.author} · ${f.role}`, { size: 9, color: MUTED, x, right: f.date });
  for (const line of comment) textLine(c, line, { size: 10, x });
  textLine(c, t(lang, 'common.deadline', { date: f.deadline }), { size: 9, color: MUTED, x, right: f.status });

  // A line along the item shows where one feedback ends; an item that runs over a page break gets none.
  if (c.doc.getCurrentPageInfo().pageNumber === page) {
    c.doc.setDrawColor(...RULE);
    c.doc.setLineWidth(0.6);
    c.doc.line(MARGIN + 0.3, top + 0.5, MARGIN + 0.3, c.y - 0.5);
  }
  c.y += 2.5;
}

function drawZone(c: Cursor, z: PdfZone, lang: Lang): void {
  const headingHeight = lineHeight(ZONE_HEADING_SIZE);
  const rows = photoRows(z.photos);
  const firstRow = rows[0];
  keepTogether(c, headingHeight + 1.5 + (firstRow ? rowLayout(firstRow).height + PHOTO_ROW_SPACE : 0));

  c.doc.setFontSize(ZONE_HEADING_SIZE);
  c.doc.setTextColor(...INK);
  c.doc.text(z.name, MARGIN, c.y + headingHeight * 0.75);
  statusChip(c, z.state, stateLabel(lang, z.state), headingHeight);
  c.y += headingHeight + 1.5;

  for (const row of rows) drawPhotoRow(c, row);
  for (const n of z.unavailablePhotos ?? []) textLine(c, t(lang, 'pdf.photoUnavailable', { n }), { size: 9, color: MUTED });

  if (z.storeComment) {
    const lines = wrap(c, z.storeComment, 10, CONTENT_WIDTH);
    keepTogether(c, 1.5 + lineHeight(8) + lines.length * lineHeight(10));
    c.y += 1.5;
    textLine(c, t(lang, 'review.storeComment'), { size: 8, color: MUTED });
    for (const line of lines) textLine(c, line, { size: 10 });
    c.y += 2;
  }

  for (const f of z.feedback) drawFeedback(c, f, lang);

  c.y += 1.5;
  if (c.y < BOTTOM) {
    c.doc.setDrawColor(...RULE);
    c.doc.setLineWidth(0.2);
    c.doc.line(MARGIN, c.y, RIGHT, c.y);
  }
  c.y += 4;
}

/** The height a zone needs at least on its page: its heading and, when it has photos, the first row of them. */
function zoneLead(z: PdfZone): number {
  const row = photoRows(z.photos)[0];
  return lineHeight(ZONE_HEADING_SIZE) + 1.5 + (row ? rowLayout(row).height + PHOTO_ROW_SPACE : 0);
}

/**
 * The report as an A4 portrait PDF with 15 mm margins: the store, country, campaign and dates, then per department
 * and zone the status, the photos (with the circles already on them), the store comment and every feedback.
 * Pure: it reads no network and no DOM. `fontBase64` is DejaVuSans.ttf, registered for all text so that Czech, Slovak
 * and Romanian letters come out right. A block that does not fit on the page starts on the next one.
 */
export function buildReportPdf(r: PdfReport, lang: Lang, fontBase64: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS(`${FONT}.ttf`, fontBase64);
  doc.addFont(`${FONT}.ttf`, FONT, 'normal');
  doc.setFont(FONT, 'normal');
  doc.setProperties({ title: `VM Photo Report ${r.storeCode} ${r.campaignName}` });

  const c: Cursor = { doc, y: MARGIN };
  textLine(c, 'VM Photo Report', { size: 9, color: MUTED });
  textLine(c, `${r.storeCode} ${r.storeName}`, { size: 18 });
  c.y += 1;
  const details = [
    [t(lang, 'review.country'), r.country],
    [t(lang, 'pdf.campaign'), r.campaignName],
    [t(lang, 'report.sent'), r.sentAt],
    [t(lang, 'pdf.exported'), r.exportedAt],
  ] as const;
  for (const [label, value] of details) textLine(c, `${label}: ${value}`, { size: 10 });
  c.y += 2;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, c.y, RIGHT, c.y);
  c.y += 3;

  let department: string | null = null;
  for (const z of r.zones) {
    if (z.department !== department) {
      department = z.department;
      c.y += DEPARTMENT_SPACE_BEFORE;
      keepTogether(c, lineHeight(DEPARTMENT_SIZE) + 3 + zoneLead(z));
      textLine(c, department, { size: DEPARTMENT_SIZE });
      doc.setDrawColor(...INK);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, c.y, RIGHT, c.y);
      c.y += 3;
    }
    drawZone(c, z, lang);
  }
  return doc;
}
