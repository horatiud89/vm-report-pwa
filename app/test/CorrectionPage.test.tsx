import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import type { FeedbackDoc, PhotoRef, ReportDoc, ZoneDoc, ZoneState } from '@shared/types';
import * as api from '../src/api';
import * as compress from '../src/photos/compress';
import { CorrectionPage } from '../src/store/CorrectionPage';
import { clearCorrectionSessions } from '../src/store/correctionSession';
import { live, makeReport, makeZone, photo } from './fixtures';
import { renderApp, signedIn } from './helpers';

const hooks = vi.hoisted(() => ({ useReport: vi.fn(), useZone: vi.fn(), useFeedback: vi.fn(), usePhotoUrl: vi.fn() }));
vi.mock('../src/data/hooks', () => hooks);
vi.mock('../src/api', () => ({ sendCorrection: vi.fn() }));
vi.mock('../src/photos/compress', () => ({ uploadZonePhoto: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

/** The instant the tests run at: 15 Oct 2026, noon in Prague. */
const NOW = Date.UTC(2026, 9, 15, 10);

const newPhoto = (n: number, version = 2): PhotoRef => ({
  path: `reports/CZ/850/r1/women-image/v${version}_${n}.jpg`, width: 1440, height: 1920,
});

function feedback(over: Partial<FeedbackDoc> = {}): FeedbackDoc {
  return {
    id: 'f1', authorUid: 'u-avm', authorRole: 'avm', authorName: 'Area VM CZ', version: 1, photoIndex: 0,
    comment: 'Move the mannequin to the left', strokes: [{ points: [0.1, 0.1, 0.4, 0.4] }],
    deadline: '2026-10-16', createdAt: Date.UTC(2026, 9, 14, 9), status: 'open',
    ...over,
  };
}

/** A zone whose first version has two photos and a store comment; `over` changes it. */
function zone(over: Partial<ZoneDoc> = {}): ZoneDoc {
  return makeZone('women-image', {
    state: 'needs_correction',
    earliestOpenDeadline: '2026-10-16',
    versions: [{ n: 1, photos: [photo(1), photo(2)], storeComment: 'Wall done', createdAt: Date.UTC(2026, 9, 13, 9) }],
    ...over,
  });
}

function renderPage(
  { z = zone(), feedbacks = [feedback()], report = makeReport({ status: 'sent', sentAt: 5 }) }:
  { z?: ZoneDoc | null; feedbacks?: FeedbackDoc[]; report?: ReportDoc | null } = {},
) {
  hooks.useReport.mockReturnValue(live(report));
  hooks.useZone.mockReturnValue(live(z));
  hooks.useFeedback.mockReturnValue(live(feedbacks));
  return renderApp(
    <>
      <Routes>
        <Route path="/r/:reportId/z/:zoneId" element={<CorrectionPage />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </>,
    { session: signedIn('store'), route: '/r/r1/z/women-image' },
  );
}

const galleryInput = (c: HTMLElement) => c.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
const jpeg = () => new File(['x'], 'a.jpg', { type: 'image/jpeg' });
const sendButton = () => screen.getByRole('button', { name: en['store.sendCorrection'] });
const newPhotos = () => screen.getByRole('region', { name: en['store.newPhotos'] });
const comment = () => screen.getByLabelText(en['store.comment']);
const photoBlock = (n: number) => screen.getByRole('region', { name: `Photo ${n}` });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  clearCorrectionSessions();
  hooks.usePhotoUrl.mockImplementation((path: string) => (path ? `https://img.test/${path}` : null));
  vi.mocked(api.sendCorrection).mockReset().mockResolvedValue(undefined);
  vi.mocked(compress.uploadZonePhoto).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CorrectionPage: feedback to correct', () => {
  test('shows the zone, its status and the open feedback with author, role, date, comment and deadline', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Women's Image");
    expect(screen.getByText(en['state.needs_correction'])).toBeInTheDocument();

    const note = screen.getByRole('article');
    expect(within(note).getByText('Move the mannequin to the left')).toBeInTheDocument();
    expect(within(note).getByText('Deadline 16.10')).toBeInTheDocument();
    expect(within(note).getByText('Area VM CZ')).toBeInTheDocument();
    expect(note).toHaveTextContent('Area VM CZ · Area VM');
    expect(note).toHaveTextContent('14 Oct 2026');
  });

  test('the feedback sits under the photo it refers to, with its circles drawn over that photo only', () => {
    const { container } = renderPage({ feedbacks: [feedback({ photoIndex: 1, strokes: [{ points: [0.2, 0.2, 0.6, 0.6] }, { points: [0.7, 0.7, 0.9, 0.9] }] })] });

    const second = photoBlock(2);
    expect(within(second).getByRole('article')).toHaveTextContent('Move the mannequin to the left');
    expect(second.querySelectorAll('polyline')).toHaveLength(2);
    expect(within(second).getByRole('img', { name: 'Photo 2' })).toHaveAttribute('src', `https://img.test/${photo(2).path}`);

    const first = photoBlock(1);
    expect(within(first).queryByRole('article')).not.toBeInTheDocument();
    expect(first.querySelectorAll('polyline')).toHaveLength(0);
    expect(within(first).getByRole('img', { name: 'Photo 1' })).toBeInTheDocument();
    expect(container.querySelectorAll('article')).toHaveLength(1);
  });

  test('several open feedbacks on one photo: newest first, circles of all of them on the one photo', () => {
    renderPage({
      feedbacks: [
        feedback({ id: 'a', comment: 'Older note', createdAt: 1_000, strokes: [{ points: [0, 0, 0.5, 0.5] }] }),
        feedback({ id: 'b', comment: 'Newer note', createdAt: 2_000, authorName: 'Head VM', authorRole: 'head_vm', strokes: [{ points: [0.5, 0.5, 1, 1] }] }),
      ],
    });
    const block = photoBlock(1);
    const notes = within(block).getAllByRole('article');
    expect(notes[0]).toHaveTextContent('Newer note');
    expect(notes[0]).toHaveTextContent('Head VM · Head of VM');
    expect(notes[1]).toHaveTextContent('Older note');
    expect(within(block).getAllByRole('img')).toHaveLength(1);
    expect(block.querySelectorAll('polyline')).toHaveLength(2);
  });

  test('feedback that was already answered is not asked for again', () => {
    renderPage({ feedbacks: [feedback({ id: 'old', comment: 'Fixed long ago', version: 1, status: 'answered' })] });
    expect(screen.queryByText('Fixed long ago')).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  test('only the feedback on the latest photos counts', () => {
    const z = zone({
      versions: [
        { n: 1, photos: [photo(1)], storeComment: '', createdAt: 1 },
        { n: 2, photos: [newPhoto(1)], storeComment: 'Redone', createdAt: 2 },
      ],
    });
    renderPage({ z, feedbacks: [feedback({ id: 'v1', comment: 'About version one', version: 1, status: 'answered' }), feedback({ id: 'v2', comment: 'About version two', version: 2 })] });
    expect(screen.getByText('About version two')).toBeInTheDocument();
    expect(screen.queryByText('About version one')).not.toBeInTheDocument();
    expect(within(photoBlock(1)).getByRole('img', { name: 'Photo 1' })).toHaveAttribute('src', `https://img.test/${newPhoto(1).path}`);
  });

  test('a deadline that has passed is red with the Overdue label; today and later are not', () => {
    renderPage({ feedbacks: [feedback({ id: 'late', deadline: '2026-10-14', createdAt: 1 }), feedback({ id: 'today', deadline: '2026-10-15', createdAt: 5 })] });
    const [today, late] = screen.getAllByRole('article') as [HTMLElement, HTMLElement];

    expect(today).toHaveTextContent('Deadline 15.10');
    expect(within(today).queryByText(en['state.overdue'])).not.toBeInTheDocument();
    expect(within(today).getByText('Deadline 15.10').closest('.is-overdue')).toBeNull();

    expect(within(late).getByText('Deadline 14.10').closest('.is-overdue')).not.toBeNull();
    expect(within(late).getByText(en['state.overdue'])).toBeInTheDocument();
  });

  test('the zone badge reads Overdue once the earliest deadline has passed', () => {
    renderPage({ z: zone({ earliestOpenDeadline: '2026-10-14' }), feedbacks: [feedback({ deadline: '2026-10-14' })] });
    expect(screen.queryByText(en['state.needs_correction'])).not.toBeInTheDocument();
    expect(screen.getAllByText(en['state.overdue'])).toHaveLength(2); // badge and the feedback's label
  });
});

describe('CorrectionPage: sending the correction', () => {
  test('Send correction is disabled without new photos and enabled with one', async () => {
    vi.mocked(compress.uploadZonePhoto).mockResolvedValue(newPhoto(1));
    const { container } = renderPage();
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText('Add photo (0/3)')).toBeInTheDocument();

    await userEvent.setup().upload(galleryInput(container), jpeg());

    await waitFor(() => expect(sendButton()).toBeEnabled());
    expect(within(newPhotos()).getByRole('img', { name: 'Photo 1' })).toHaveAttribute('src', `https://img.test/${newPhoto(1).path}`);
    expect(screen.getByText('Add photo (1/3)')).toBeInTheDocument();
  });

  test('new photos are uploaded to the next version of the zone', async () => {
    vi.mocked(compress.uploadZonePhoto).mockResolvedValue(newPhoto(1));
    const report = makeReport({ status: 'sent', sentAt: 5 });
    const { container } = renderPage({ report });
    const file = jpeg();
    await userEvent.setup().upload(galleryInput(container), file);
    expect(compress.uploadZonePhoto).toHaveBeenCalledWith(report, 'women-image', 2, file, expect.any(Function));
  });

  test('the click sends the uploaded photos and the comment, then confirms and goes home', async () => {
    vi.mocked(compress.uploadZonePhoto).mockResolvedValueOnce(newPhoto(1)).mockResolvedValueOnce(newPhoto(2));
    const { container } = renderPage();
    const user = userEvent.setup();
    await user.upload(galleryInput(container), jpeg());
    await waitFor(() => expect(screen.getByText('Add photo (1/3)')).toBeInTheDocument());
    await user.upload(galleryInput(container), jpeg());
    await waitFor(() => expect(sendButton()).toBeEnabled());
    expect(screen.getByText('Add photo (2/3)')).toBeInTheDocument();
    await user.type(comment(), 'Moved it, new sign added');

    await user.click(sendButton());

    expect(api.sendCorrection).toHaveBeenCalledTimes(1);
    expect(api.sendCorrection).toHaveBeenCalledWith({
      reportId: 'r1', zoneId: 'women-image', photos: [newPhoto(1), newPhoto(2)], storeComment: 'Moved it, new sign added',
    });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
    expect(screen.getByRole('status')).toHaveTextContent(en['state.correction_sent']);
  });

  test('a correction without a comment is sent with an empty comment', async () => {
    vi.mocked(compress.uploadZonePhoto).mockResolvedValue(newPhoto(1));
    const { container } = renderPage();
    const user = userEvent.setup();
    await user.upload(galleryInput(container), jpeg());
    await waitFor(() => expect(sendButton()).toBeEnabled());
    await user.click(sendButton());
    expect(api.sendCorrection).toHaveBeenCalledWith({ reportId: 'r1', zoneId: 'women-image', photos: [newPhoto(1)], storeComment: '' });
  });

  test('Send stays disabled while a photo is still uploading, and the progress shows', async () => {
    let progress!: (fraction: number) => void;
    let finish!: (p: PhotoRef) => void;
    vi.mocked(compress.uploadZonePhoto).mockImplementation((_r, _z, _v, _f, onProgress) => {
      progress = onProgress!;
      return new Promise((resolve) => { finish = resolve; });
    });
    const { container } = renderPage();
    await userEvent.setup().upload(galleryInput(container), jpeg());

    expect(sendButton()).toBeDisabled();
    act(() => progress(0.4));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText('Add photo (1/3)')).toBeInTheDocument();

    await act(async () => finish(newPhoto(1)));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
  });

  test('a second photo cannot be sent while it uploads, even though the first one is ready', async () => {
    let finish!: (p: PhotoRef) => void;
    vi.mocked(compress.uploadZonePhoto)
      .mockResolvedValueOnce(newPhoto(1))
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { container } = renderPage();
    const user = userEvent.setup();
    await user.upload(galleryInput(container), jpeg());
    await waitFor(() => expect(sendButton()).toBeEnabled());
    await user.upload(galleryInput(container), jpeg());

    expect(sendButton()).toBeDisabled();
    await act(async () => finish(newPhoto(2)));
    expect(sendButton()).toBeEnabled();
  });

  test('at three new photos nothing more can be added', async () => {
    vi.mocked(compress.uploadZonePhoto).mockResolvedValueOnce(newPhoto(1)).mockResolvedValueOnce(newPhoto(2)).mockResolvedValueOnce(newPhoto(3));
    const { container } = renderPage();
    const user = userEvent.setup();
    for (let i = 1; i <= 3; i += 1) {
      await user.upload(galleryInput(container), jpeg());
      await waitFor(() => expect(screen.getByText(`Add photo (${i}/3)`)).toBeInTheDocument());
    }
    expect(screen.getByRole('button', { name: en['store.takePhoto'] })).toBeDisabled();
    expect(screen.getByRole('button', { name: en['store.choosePhoto'] })).toBeDisabled();
  });

  test('a photo can be removed again, which can leave Send disabled', async () => {
    vi.mocked(compress.uploadZonePhoto).mockResolvedValue(newPhoto(1));
    const { container } = renderPage();
    const user = userEvent.setup();
    await user.upload(galleryInput(container), jpeg());
    await waitFor(() => expect(sendButton()).toBeEnabled());

    await user.click(screen.getByRole('button', { name: en['store.removePhoto'] }));

    expect(within(newPhotos()).queryByRole('img')).not.toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText('Add photo (0/3)')).toBeInTheDocument();
  });

  test('a failed upload shows an error and adds nothing', async () => {
    vi.mocked(compress.uploadZonePhoto).mockRejectedValue(new Error('storage/retry-limit-exceeded'));
    const { container } = renderPage();
    await userEvent.setup().upload(galleryInput(container), jpeg());

    expect(await screen.findByText(en['error.generic'])).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText('Add photo (0/3)')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  test('a failed send shows an error and keeps the photos and the comment, so Send can be tried again', async () => {
    vi.mocked(compress.uploadZonePhoto).mockResolvedValue(newPhoto(1));
    vi.mocked(api.sendCorrection).mockRejectedValueOnce(new Error('unavailable'));
    const { container } = renderPage();
    const user = userEvent.setup();
    await user.upload(galleryInput(container), jpeg());
    await waitFor(() => expect(sendButton()).toBeEnabled());
    await user.type(comment(), 'New display');

    await user.click(sendButton());

    expect(await screen.findByRole('status')).toHaveTextContent(en['error.generic']);
    expect(sendButton()).toBeEnabled();
    expect(comment()).toHaveValue('New display');
    expect(within(newPhotos()).getByRole('img', { name: 'Photo 1' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/r/r1/z/women-image');

    await user.click(sendButton());
    expect(api.sendCorrection).toHaveBeenCalledTimes(2);
    expect(api.sendCorrection).toHaveBeenLastCalledWith({ reportId: 'r1', zoneId: 'women-image', photos: [newPhoto(1)], storeComment: 'New display' });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
  });

  test('while the correction is on its way Send is disabled and a second tap sends nothing', async () => {
    vi.mocked(compress.uploadZonePhoto).mockResolvedValue(newPhoto(1));
    let finish!: () => void;
    vi.mocked(api.sendCorrection).mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const { container } = renderPage();
    const user = userEvent.setup();
    await user.upload(galleryInput(container), jpeg());
    await waitFor(() => expect(sendButton()).toBeEnabled());

    await user.click(sendButton());
    expect(sendButton()).toBeDisabled();
    expect(comment()).toBeDisabled();
    await user.click(sendButton());
    expect(api.sendCorrection).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
  });

  test('the comment is limited to 500 characters, like on the server', () => {
    renderPage();
    expect(comment()).toHaveAttribute('maxlength', '500');
  });
});

describe('CorrectionPage: leaving and coming back', () => {
  test('photos and comment survive leaving the page, and an upload that ends meanwhile lands in the right place', async () => {
    let finish!: (p: PhotoRef) => void;
    vi.mocked(compress.uploadZonePhoto)
      .mockResolvedValueOnce(newPhoto(1))
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const first = renderPage();
    const user = userEvent.setup();
    await user.upload(galleryInput(first.container), jpeg());
    await waitFor(() => expect(sendButton()).toBeEnabled());
    await user.type(comment(), 'Half done');
    await user.upload(galleryInput(first.container), jpeg());
    first.unmount();
    cleanup();

    await act(async () => finish(newPhoto(2)));
    renderPage();

    expect(comment()).toHaveValue('Half done');
    expect(within(newPhotos()).getAllByRole('img')).toHaveLength(2);
    expect(screen.getByText('Add photo (2/3)')).toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
  });

  test('an upload still running when the page is opened again is shown as running', async () => {
    vi.mocked(compress.uploadZonePhoto).mockImplementation(() => new Promise(() => undefined));
    const first = renderPage();
    await userEvent.setup().upload(galleryInput(first.container), jpeg());
    first.unmount();
    cleanup();

    renderPage();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  test('after a successful send nothing of it is kept for the next correction', async () => {
    vi.mocked(compress.uploadZonePhoto).mockResolvedValue(newPhoto(1));
    const first = renderPage();
    const user = userEvent.setup();
    await user.upload(galleryInput(first.container), jpeg());
    await waitFor(() => expect(sendButton()).toBeEnabled());
    await user.type(comment(), 'Done');
    await user.click(sendButton());
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
    first.unmount();
    cleanup();

    renderPage();
    expect(comment()).toHaveValue('');
    expect(screen.getByText('Add photo (0/3)')).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  test('photos prepared for an earlier round are not carried into the next one', async () => {
    vi.mocked(compress.uploadZonePhoto).mockResolvedValue(newPhoto(1));
    const first = renderPage();
    const user = userEvent.setup();
    await user.upload(galleryInput(first.container), jpeg());
    await waitFor(() => expect(sendButton()).toBeEnabled());
    first.unmount();
    cleanup();

    // The correction was sent from another phone and the reviewer has given new feedback since.
    const later = zone({
      versions: [
        { n: 1, photos: [photo(1)], storeComment: '', createdAt: 1 },
        { n: 2, photos: [newPhoto(1)], storeComment: '', createdAt: 2 },
      ],
    });
    const second = renderPage({ z: later, feedbacks: [feedback({ version: 2 })] });
    expect(screen.getByText('Add photo (0/3)')).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();

    vi.mocked(compress.uploadZonePhoto).mockClear();
    await user.upload(galleryInput(second.container), jpeg());
    expect(compress.uploadZonePhoto).toHaveBeenCalledWith(expect.anything(), 'women-image', 3, expect.anything(), expect.any(Function));
  });
});

describe('CorrectionPage: history of zones that need nothing from the store', () => {
  const sentReport = () => makeReport({ status: 'sent', sentAt: 5 });

  function twoRounds(state: ZoneState = 'correction_sent'): ZoneDoc {
    return zone({
      state,
      earliestOpenDeadline: null,
      versions: [
        { n: 1, photos: [photo(1), photo(2)], storeComment: 'Wall done', createdAt: Date.UTC(2026, 9, 13, 9) },
        { n: 2, photos: [newPhoto(1)], storeComment: 'Moved the mannequin', createdAt: Date.UTC(2026, 9, 15, 9) },
      ],
    });
  }

  test('lists the versions newest first, each with its photos and store comment', () => {
    renderPage({ z: twoRounds(), feedbacks: [], report: sentReport() });
    const versions = screen.getAllByRole('region');
    expect(versions.map((v) => within(v).getByRole('heading', { level: 2 }).textContent)).toEqual(['Version 2', 'Version 1']);

    expect(within(versions[0]!).getAllByRole('img')).toHaveLength(1);
    expect(within(versions[0]!).getByText('Moved the mannequin')).toBeInTheDocument();
    expect(within(versions[0]!).getByText('15 Oct 2026')).toBeInTheDocument();
    expect(within(versions[1]!).getAllByRole('img')).toHaveLength(2);
    expect(within(versions[1]!).getByText('Wall done')).toBeInTheDocument();
    expect(screen.getByText(en['state.correction_sent'])).toBeInTheDocument();
  });

  test('shows the feedback given on each version with its circles, whatever its status, and nothing to edit', () => {
    const { container } = renderPage({
      z: twoRounds('approved'),
      report: sentReport(),
      feedbacks: [
        feedback({ id: 'a', comment: 'Shift left', photoIndex: 1, status: 'answered', deadline: '2026-10-14', strokes: [{ points: [0.2, 0.2, 0.5, 0.5] }, { points: [0.6, 0.6, 0.8, 0.8] }] }),
        feedback({ id: 'b', comment: 'Looks good now', version: 2, photoIndex: 0, status: 'answered', createdAt: Date.UTC(2026, 9, 15, 12), strokes: [] }),
      ],
    });
    const [second, first] = screen.getAllByRole('region') as [HTMLElement, HTMLElement];

    const onFirst = within(first).getByRole('article');
    expect(onFirst).toHaveTextContent('Shift left');
    expect(onFirst).toHaveTextContent('Area VM CZ · Area VM');
    expect(onFirst).toHaveTextContent('Deadline 14.10');
    // Answered feedback is history: its deadline is not shown as overdue.
    expect(within(onFirst).queryByText(en['state.overdue'])).not.toBeInTheDocument();
    expect(first.querySelectorAll('polyline')).toHaveLength(2);

    expect(within(second).getByRole('article')).toHaveTextContent('Looks good now');
    expect(second.querySelectorAll('polyline')).toHaveLength(0);

    expect(screen.queryByLabelText(en['store.comment'])).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  test('a submitted zone shows what was sent, read-only', () => {
    const z = makeZone('women-image', {
      state: 'submitted', versions: [{ n: 1, photos: [photo(1), photo(2)], storeComment: 'Wall done', createdAt: 1 }],
    });
    const { container } = renderPage({ z, feedbacks: [], report: sentReport() });

    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getByText('Wall done')).toBeInTheDocument();
    expect(screen.getByText(en['state.submitted'])).toBeInTheDocument();
    expect(screen.queryByLabelText(en['store.comment'])).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  test('a zone that is not part of the campaign shows only its status', () => {
    const z = makeZone('women-image', { state: 'not_in_campaign' });
    renderPage({ z, feedbacks: [], report: sentReport() });
    expect(screen.getByText(en['state.not_in_campaign'])).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('CorrectionPage: loading and missing data', () => {
  function renderWith(feedbackResult: { data: FeedbackDoc[]; loading: boolean; error: Error | null }) {
    hooks.useReport.mockReturnValue(live(makeReport({ status: 'sent', sentAt: 5 })));
    hooks.useZone.mockReturnValue(live(zone()));
    hooks.useFeedback.mockReturnValue(feedbackResult);
    return renderApp(
      <Routes><Route path="/r/:reportId/z/:zoneId" element={<CorrectionPage />} /></Routes>,
      { session: signedIn('store'), route: '/r/r1/z/women-image' },
    );
  }

  test('shows the busy indicator while the feedback loads', () => {
    const { container } = renderWith({ data: [], loading: true, error: null });
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('a read error shows the error message', () => {
    renderWith({ data: [], loading: false, error: new Error('permission-denied') });
    expect(screen.getByRole('alert')).toHaveTextContent(en['error.generic']);
  });

  test('an unknown zone goes back to the report', () => {
    renderPage({ z: null });
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/r\/r1$/);
  });

  test('an unknown report goes home', () => {
    renderPage({ report: null });
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });
});
