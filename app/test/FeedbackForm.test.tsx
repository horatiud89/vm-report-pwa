import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import * as api from '../src/api';
import { FeedbackForm } from '../src/review/FeedbackForm';
import { makeReport, makeZone, photo } from './fixtures';
import { renderApp, signedIn } from './helpers';

const hooks = vi.hoisted(() => ({ usePhotoUrl: vi.fn() }));
vi.mock('../src/data/hooks', () => hooks);
vi.mock('../src/api', () => ({ giveFeedback: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));

/** 15 Oct 2026, noon in Prague. */
const NOW = Date.UTC(2026, 9, 15, 10);

const report = makeReport({ status: 'sent', sentAt: 5 });
const zone = makeZone('women-image', {
  state: 'submitted',
  versions: [{ n: 1, photos: [photo(1), photo(2)], storeComment: '', createdAt: 1 }],
});

function renderForm(props: Partial<Parameters<typeof FeedbackForm>[0]> = {}) {
  return renderApp(<FeedbackForm report={report} zone={zone} version={1} photoIndex={1} photoAlt="Photo 2" {...props} />, { session: signedIn('avm') });
}

const comment = () => screen.getByLabelText(en['review.feedback']);
const deadline = () => screen.getByLabelText(en['review.deadline']) as HTMLInputElement;
const send = () => screen.getByRole('button', { name: en['review.sendFeedback'] });
const markButton = () => screen.getByRole('button', { name: en['review.markOnPhoto'] });

/** The photo box of the drawing surface is 200 x 100 px at the screen origin. */
function sizePhoto() {
  const img = screen.getByRole('group', { name: en['review.markOnPhoto'] }).querySelector('img') as HTMLImageElement;
  vi.spyOn(img, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
}

function drawLine(from: [number, number], to: [number, number]) {
  const surface = screen.getByRole('group', { name: en['review.markOnPhoto'] });
  fireEvent.pointerDown(surface, { pointerId: 1, isPrimary: true, button: 0, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(surface, { pointerId: 1, isPrimary: true, clientX: (from[0] + to[0]) / 2, clientY: (from[1] + to[1]) / 2 });
  fireEvent.pointerMove(surface, { pointerId: 1, isPrimary: true, clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(surface, { pointerId: 1, isPrimary: true, clientX: to[0], clientY: to[1] });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  hooks.usePhotoUrl.mockReset().mockImplementation((path: string) => (path ? `https://img.test/${path}` : null));
  vi.mocked(api.giveFeedback).mockReset().mockResolvedValue({ feedbackId: 'f1' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('FeedbackForm: what can be sent', () => {
  test('Send stays disabled until there is a comment and a deadline', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderForm();
    expect(send()).toBeDisabled();

    await user.type(comment(), 'Move the mannequin');
    expect(send()).toBeDisabled(); // no deadline yet

    fireEvent.change(deadline(), { target: { value: '2026-10-20' } });
    expect(send()).toBeEnabled();

    await user.clear(comment());
    expect(send()).toBeDisabled(); // a deadline alone is not enough
  });

  test('a comment of spaces only does not count', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderForm();
    await user.type(comment(), '   ');
    fireEvent.change(deadline(), { target: { value: '2026-10-20' } });
    expect(send()).toBeDisabled();
  });

  test('the comment allows 1000 characters and the deadline cannot be before the store-local today', () => {
    renderForm();
    expect(comment()).toHaveAttribute('maxlength', '1000');
    expect(deadline()).toHaveAttribute('type', 'date');
    expect(deadline()).toHaveAttribute('min', '2026-10-15');
  });

  test('the earliest deadline follows the store time zone, not the reviewer’s', () => {
    // 22:30 UTC on 15 Oct is already 16 Oct in Prague.
    vi.setSystemTime(Date.UTC(2026, 9, 15, 22, 30));
    renderForm();
    expect(deadline()).toHaveAttribute('min', '2026-10-16');
  });
});

describe('FeedbackForm: sending', () => {
  async function fillIn(user: ReturnType<typeof userEvent.setup>) {
    await user.type(comment(), '  Fold the shirts  ');
    fireEvent.change(deadline(), { target: { value: '2026-10-20' } });
  }

  test('calls giveFeedback with the report, zone, version, photo, trimmed comment, no strokes and the deadline', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderForm();
    await fillIn(user);
    await user.click(send());

    expect(api.giveFeedback).toHaveBeenCalledTimes(1);
    expect(api.giveFeedback).toHaveBeenCalledWith({
      reportId: 'r1', zoneId: 'women-image', version: 1, photoIndex: 1, comment: 'Fold the shirts', strokes: [], deadline: '2026-10-20',
    });
  });

  test('on success the form is emptied and the reviewer is told', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderForm();
    await fillIn(user);
    await user.click(send());

    expect(await screen.findByText(en['review.feedbackSent'])).toBeInTheDocument();
    expect(comment()).toHaveValue('');
    expect(deadline()).toHaveValue('');
    expect(send()).toBeDisabled();
  });

  test('on error the reviewer sees the generic error and keeps everything typed', async () => {
    vi.mocked(api.giveFeedback).mockRejectedValue(new Error('functions/failed-precondition'));
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderForm();
    await fillIn(user);
    await user.click(send());

    expect(await screen.findByText(en['error.generic'])).toBeInTheDocument();
    expect(screen.queryByText(en['review.feedbackSent'])).not.toBeInTheDocument();
    expect(comment()).toHaveValue('  Fold the shirts  ');
    expect(deadline()).toHaveValue('2026-10-20');
    expect(send()).toBeEnabled(); // can be tried again
  });

  test('a second tap while the first is still on its way sends nothing more', async () => {
    let finish: (value: { feedbackId: string }) => void = () => undefined;
    vi.mocked(api.giveFeedback).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderForm();
    await fillIn(user);
    await user.click(send());
    expect(send()).toBeDisabled();
    await user.click(send());
    expect(api.giveFeedback).toHaveBeenCalledTimes(1);

    await act(async () => { finish({ feedbackId: 'f1' }); });
    await waitFor(() => expect(comment()).toHaveValue(''));
  });
});

describe('FeedbackForm: marking on the photo', () => {
  test('shows the photo it is about, which the drawing surface replaces while marking', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderForm();
    const copies = () => document.querySelectorAll(`img[src="https://img.test/${photo(2).path}"]`);
    expect(screen.getByRole('img', { name: 'Photo 2' })).toHaveAttribute('src', `https://img.test/${photo(2).path}`);

    await user.click(markButton());
    expect(screen.queryByRole('img', { name: 'Photo 2' })).not.toBeInTheDocument();
    expect(copies()).toHaveLength(1);

    await user.click(markButton());
    expect(screen.getByRole('img', { name: 'Photo 2' })).toBeInTheDocument();
    expect(copies()).toHaveLength(1);
  });

  test('starting to mark brings the drawing surface into view (feedback notes may stand between it and the button)', async () => {
    const scrolled: Element[] = [];
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value(this: Element, options: ScrollIntoViewOptions) { expect(options).toEqual({ block: 'nearest' }); scrolled.push(this); },
      configurable: true,
    });
    try {
      const user = userEvent.setup({ advanceTimers: () => undefined });
      renderForm();
      expect(scrolled).toHaveLength(0);
      await user.click(markButton());
      expect(scrolled).toHaveLength(1);
      expect(scrolled[0]).toContainElement(screen.getByRole('group', { name: en['review.markOnPhoto'] }));
    } finally {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });

  test('the photo to draw on only shows after Mark on photo is tapped, and goes away when tapped again', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderForm();
    expect(screen.queryByRole('group', { name: en['review.markOnPhoto'] })).not.toBeInTheDocument();
    expect(markButton()).toHaveAttribute('aria-pressed', 'false');

    await user.click(markButton());
    const surface = screen.getByRole('group', { name: en['review.markOnPhoto'] });
    expect(surface.querySelector('img')).toHaveAttribute('src', `https://img.test/${photo(2).path}`); // photoIndex 1
    expect(markButton()).toHaveAttribute('aria-pressed', 'true');

    await user.click(markButton());
    expect(screen.queryByRole('group', { name: en['review.markOnPhoto'] })).not.toBeInTheDocument();
  });

  test('the circles drawn are sent as fractions of the photo, and Undo takes the last one back', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderForm();
    await user.click(markButton());
    sizePhoto();

    drawLine([20, 10], [100, 50]);
    drawLine([0, 0], [200, 100]);
    expect(screen.getByRole('group', { name: en['review.markOnPhoto'] }).querySelectorAll('polyline')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: en['review.undo'] }));
    expect(screen.getByRole('group', { name: en['review.markOnPhoto'] }).querySelectorAll('polyline')).toHaveLength(1);

    await user.type(comment(), 'Here');
    fireEvent.change(deadline(), { target: { value: '2026-10-20' } });
    await user.click(send());

    expect(api.giveFeedback).toHaveBeenCalledWith(expect.objectContaining({
      strokes: [{ points: [0.1, 0.1, 0.3, 0.3, 0.5, 0.5] }],
    }));
  });

  test('after a successful send the marks are gone and the photo is hidden again', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderForm();
    await user.click(markButton());
    sizePhoto();
    drawLine([20, 10], [100, 50]);
    await user.type(comment(), 'Here');
    fireEvent.change(deadline(), { target: { value: '2026-10-20' } });
    await user.click(send());
    await screen.findByText(en['review.feedbackSent']);

    expect(screen.queryByRole('group', { name: en['review.markOnPhoto'] })).not.toBeInTheDocument();
    await user.click(markButton());
    expect(screen.getByRole('group', { name: en['review.markOnPhoto'] }).querySelectorAll('polyline')).toHaveLength(0);
  });
});
