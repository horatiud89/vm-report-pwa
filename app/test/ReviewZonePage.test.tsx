import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import type { FeedbackDoc, ReportDoc, ZoneDoc, ZoneState } from '@shared/types';
import * as api from '../src/api';
import { ReviewZonePage } from '../src/review/ReviewZonePage';
import { live, makeReport, makeZone, versionPhoto } from './fixtures';
import { renderApp, signedIn } from './helpers';

const hooks = vi.hoisted(() => ({ useReport: vi.fn(), useZone: vi.fn(), useFeedback: vi.fn(), usePhotoUrl: vi.fn() }));
vi.mock('../src/data/hooks', () => hooks);
vi.mock('../src/api', () => ({ approveZone: vi.fn(), giveFeedback: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

/** 15 Oct 2026, noon in Prague. */
const NOW = Date.UTC(2026, 9, 15, 10);

function feedback(over: Partial<FeedbackDoc> = {}): FeedbackDoc {
  return {
    id: 'f1', authorUid: 'u-avm', authorRole: 'avm', authorName: 'Area VM CZ', version: 1, photoIndex: 0,
    comment: 'Move the mannequin to the left', strokes: [{ points: [0.1, 0.1, 0.4, 0.4] }],
    deadline: '2026-10-20', createdAt: Date.UTC(2026, 9, 14, 9), status: 'open',
    ...over,
  };
}

/** A zone with one version of two photos; `over` changes it. */
function zone(over: Partial<ZoneDoc> = {}): ZoneDoc {
  return makeZone('women-image', {
    state: 'submitted',
    versions: [{ n: 1, photos: [versionPhoto(1, 1), versionPhoto(2, 1)], storeComment: 'Wall done', createdAt: Date.UTC(2026, 9, 13, 9) }],
    ...over,
  });
}

/** A zone the store has corrected once: version 1 (two photos, answered feedback) and version 2 (one new photo). */
function correctedZone(over: Partial<ZoneDoc> = {}): ZoneDoc {
  return zone({
    state: 'correction_sent',
    versions: [
      { n: 1, photos: [versionPhoto(1, 1), versionPhoto(2, 1)], storeComment: 'Wall done', createdAt: Date.UTC(2026, 9, 13, 9) },
      { n: 2, photos: [versionPhoto(1, 2)], storeComment: 'Moved it', createdAt: Date.UTC(2026, 9, 14, 15) },
    ],
    ...over,
  });
}

function renderPage(
  { z = zone(), feedbacks = [] as FeedbackDoc[], report = makeReport({ status: 'sent', sentAt: 5 }) }:
  { z?: ZoneDoc | null; feedbacks?: FeedbackDoc[]; report?: ReportDoc | null } = {},
) {
  hooks.useReport.mockReturnValue(live(report));
  hooks.useZone.mockReturnValue(live(z));
  hooks.useFeedback.mockReturnValue(live(feedbacks));
  return renderApp(
    <>
      <Routes>
        <Route path="/r/:reportId/z/:zoneId" element={<ReviewZonePage />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </>,
    { session: signedIn('avm', 'en', { country: 'CZ' }), route: '/r/r1/z/women-image' },
  );
}

const photoSection = (n: number) => screen.getByRole('region', { name: `Photo ${n}` });
const approveButton = () => screen.queryByRole('button', { name: en['review.approve'] });
const src = (path: string) => `https://img.test/${path}`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  hooks.usePhotoUrl.mockImplementation((path: string) => (path ? src(path) : null));
  vi.mocked(api.approveZone).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.giveFeedback).mockReset().mockResolvedValue({ feedbackId: 'new' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ReviewZonePage: what the store sent', () => {
  test('shows the zone, its status, the store comment and the photos of the version', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Women's Image");
    expect(screen.getByText(en['state.submitted'])).toBeInTheDocument();
    expect(screen.getByText('Wall done')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: en['review.storeComment'] })).toBeInTheDocument();
    expect(within(photoSection(1)).getByRole('img', { name: 'Photo 1' })).toHaveAttribute('src', src(versionPhoto(1, 1).path));
    expect(within(photoSection(2)).getByRole('img', { name: 'Photo 2' })).toHaveAttribute('src', src(versionPhoto(2, 1).path));
  });

  test('a zone the store did not take part in with has no photos and no feedback form', () => {
    renderPage({ z: zone({ state: 'not_in_campaign', versions: [{ n: 1, photos: [], storeComment: '', createdAt: 1 }] }) });
    expect(screen.getByText(en['state.not_in_campaign'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en['review.sendFeedback'] })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en['review.approve'] })).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  test('a report or zone that is not there sends the reviewer back', () => {
    renderPage({ report: null });
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  test('a zone that is not there sends the reviewer back to the report', () => {
    renderPage({ z: null });
    expect(screen.getByTestId('where').textContent).toBe('/r/r1');
  });

  test('says something went wrong when the zone cannot be read', () => {
    hooks.useReport.mockReturnValue(live(makeReport({ status: 'sent' })));
    hooks.useZone.mockReturnValue({ data: null, loading: false, error: new Error('x') });
    hooks.useFeedback.mockReturnValue(live([]));
    renderApp(<ReviewZonePage />, { session: signedIn('avm', 'en', { country: 'CZ' }) });
    expect(screen.getByRole('alert')).toHaveTextContent(en['error.generic']);
  });
});

describe('ReviewZonePage: feedback', () => {
  test('every photo has its own form, which sends feedback for that photo of the latest version', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage();
    expect(screen.getAllByRole('button', { name: en['review.sendFeedback'] })).toHaveLength(2);

    const second = within(photoSection(2));
    await user.type(second.getByLabelText(en['review.feedback']), 'Straighten the rail');
    fireEvent.change(second.getByLabelText(en['review.deadline']), { target: { value: '2026-10-22' } });
    await user.click(second.getByRole('button', { name: en['review.sendFeedback'] }));

    expect(api.giveFeedback).toHaveBeenCalledWith({
      reportId: 'r1', zoneId: 'women-image', version: 1, photoIndex: 1, comment: 'Straighten the rail', strokes: [], deadline: '2026-10-22',
    });
    expect(within(photoSection(1)).getByRole('button', { name: en['review.sendFeedback'] })).toBeDisabled();
  });

  test('feedback is given on the latest version of a corrected zone', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage({ z: correctedZone(), feedbacks: [feedback()] });
    const first = within(photoSection(1));
    await user.type(first.getByLabelText(en['review.feedback']), 'Still crooked');
    fireEvent.change(first.getByLabelText(en['review.deadline']), { target: { value: '2026-10-22' } });
    await user.click(first.getByRole('button', { name: en['review.sendFeedback'] }));

    expect(api.giveFeedback).toHaveBeenCalledWith(expect.objectContaining({ version: 2, photoIndex: 0 }));
    expect(screen.getAllByRole('button', { name: en['review.sendFeedback'] })).toHaveLength(1); // the new version has one photo
  });

  test('shows the feedback under its photo: author, role, date, comment, deadline and status', () => {
    renderPage({ z: zone({ state: 'needs_correction', earliestOpenDeadline: '2026-10-20' }), feedbacks: [feedback({ photoIndex: 1 })] });
    const note = within(photoSection(2)).getByRole('article');
    expect(note).toHaveTextContent('Area VM CZ · Area VM');
    expect(note).toHaveTextContent('14 Oct 2026');
    expect(note).toHaveTextContent('Move the mannequin to the left');
    expect(note).toHaveTextContent('Deadline 20.10');
    expect(note).toHaveTextContent(en['review.statusOpen']);
    expect(within(photoSection(1)).queryByRole('article')).not.toBeInTheDocument();
  });

  test('an open feedback past its deadline reads Overdue', () => {
    renderPage({ z: zone({ state: 'needs_correction' }), feedbacks: [feedback({ deadline: '2026-10-14' })] });
    const note = within(photoSection(1)).getByRole('article');
    expect(note).toHaveTextContent(en['state.overdue']);
  });

  test('several feedbacks on one photo each show their own circles on their own copy of the photo', () => {
    renderPage({
      z: zone({ state: 'needs_correction' }),
      feedbacks: [
        feedback({ id: 'a', authorName: 'Area VM CZ', comment: 'First', strokes: [{ points: [0.1, 0.1, 0.2, 0.2] }], createdAt: 1000 }),
        feedback({ id: 'b', authorRole: 'head_vm', authorName: 'Head VM', comment: 'Second', strokes: [{ points: [0.5, 0.5, 0.6, 0.6] }, { points: [0.7, 0.7, 0.8, 0.8] }], createdAt: 2000 }),
      ],
    });
    const section = photoSection(1);
    const notes = within(section).getAllByRole('article');
    expect(notes).toHaveLength(2);
    expect(notes[0]).toHaveTextContent('Second'); // newest first
    expect(notes[1]).toHaveTextContent('First');

    const items = Array.from(section.querySelectorAll('.feedback-item'));
    expect(items).toHaveLength(2);
    expect(items[0]!.querySelectorAll('polyline')).toHaveLength(2);
    expect(items[1]!.querySelectorAll('polyline')).toHaveLength(1);
    // The plain photo above them carries no circles at all.
    expect(section.querySelector(':scope > .photo-frame')!.querySelectorAll('polyline')).toHaveLength(0);
  });

  test('feedback without circles shows no extra photo', () => {
    renderPage({ z: zone({ state: 'needs_correction' }), feedbacks: [feedback({ strokes: [] })] });
    const section = photoSection(1);
    expect(section.querySelectorAll('.feedback-item img')).toHaveLength(0);
    expect(within(section).getAllByRole('img')).toHaveLength(1);
    expect(within(section).getByRole('article')).toBeInTheDocument();
  });
});

describe('ReviewZonePage: approve', () => {
  test.each(['submitted', 'correction_sent'] as const)('a zone that is %s can be approved, and the reviewer goes back to the report', async (state) => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage({ z: state === 'correction_sent' ? correctedZone() : zone({ state }), feedbacks: state === 'correction_sent' ? [feedback({ status: 'answered' })] : [] });
    await user.click(approveButton()!);

    expect(api.approveZone).toHaveBeenCalledWith({ reportId: 'r1', zoneId: 'women-image' });
    expect(await screen.findByText(en['state.approved'])).toBeInTheDocument();
    expect(screen.getByTestId('where').textContent).toBe('/r/r1');
  });

  test.each(['needs_correction', 'approved', 'not_in_campaign'] as ZoneState[])('a zone that is %s has no Approve button', (state) => {
    renderPage({ z: zone({ state }) });
    expect(approveButton()).not.toBeInTheDocument();
  });

  test('on error the reviewer stays, sees the generic error and can try again', async () => {
    vi.mocked(api.approveZone).mockRejectedValueOnce(new Error('functions/failed-precondition'));
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage();
    await user.click(approveButton()!);

    expect(await screen.findByText(en['error.generic'])).toBeInTheDocument();
    expect(screen.getByTestId('where').textContent).toBe('/r/r1/z/women-image');
    expect(approveButton()).toBeEnabled();
    await user.click(approveButton()!);
    expect(api.approveZone).toHaveBeenCalledTimes(2);
  });

  test('a second tap while the first is on its way approves once', async () => {
    let finish: () => void = () => undefined;
    vi.mocked(api.approveZone).mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage();
    await user.click(approveButton()!);
    expect(approveButton()).toBeDisabled();
    await user.click(approveButton()!);
    expect(api.approveZone).toHaveBeenCalledTimes(1);
    finish();
    expect(await screen.findByText(en['state.approved'])).toBeInTheDocument();
  });
});

describe('ReviewZonePage: before and after', () => {
  const answered = (over: Partial<FeedbackDoc> = {}) => feedback({ status: 'answered', ...over });

  test('a zone with one version has no comparison', () => {
    renderPage();
    expect(screen.queryByRole('heading', { name: en['review.beforeAfter'] })).not.toBeInTheDocument();
  });

  test('a corrected zone shows the previous photos with their circles next to the new photos, each labelled', () => {
    renderPage({
      z: correctedZone(),
      feedbacks: [
        answered({ id: 'a', photoIndex: 0, strokes: [{ points: [0.1, 0.1, 0.4, 0.4] }, { points: [0.5, 0.5, 0.6, 0.6] }] }),
        answered({ id: 'b', photoIndex: 1, strokes: [{ points: [0.2, 0.2, 0.3, 0.3] }], comment: 'Fold the shirts' }),
      ],
    });
    const comparison = screen.getByRole('region', { name: en['review.beforeAfter'] });
    const figures = within(comparison).getAllByRole('figure');
    expect(figures).toHaveLength(3); // Before | After for photo 1, and a Before without an After for photo 2

    // Row 1: Before photo 1 with its two circles above (in the DOM) After photo 1 without any.
    expect(figures[0]).toHaveTextContent(en['review.before']);
    expect(within(figures[0]!).getByRole('img', { name: /Photo 1/ })).toHaveAttribute('src', src(versionPhoto(1, 1).path));
    expect(figures[0]!.querySelectorAll('polyline')).toHaveLength(2);
    expect(figures[1]).toHaveTextContent(en['review.after']);
    expect(within(figures[1]!).getByRole('img', { name: /Photo 1/ })).toHaveAttribute('src', src(versionPhoto(1, 2).path));
    expect(figures[1]!.querySelectorAll('polyline')).toHaveLength(0);

    // Row 2: Before photo 2 has no After counterpart (the new version has one photo only).
    expect(figures[2]).toHaveTextContent(en['review.before']);
    expect(within(figures[2]!).getByRole('img', { name: /Photo 2/ })).toHaveAttribute('src', src(versionPhoto(2, 1).path));
    expect(figures[2]!.querySelectorAll('polyline')).toHaveLength(1);
    expect(within(figures[2]!).getByText('Fold the shirts')).toBeInTheDocument();
  });

  test('the earlier feedback is shown as answered, with who gave it', () => {
    renderPage({ z: correctedZone(), feedbacks: [answered({ deadline: '2026-10-14' })] });
    const note = within(screen.getByRole('region', { name: en['review.beforeAfter'] })).getByRole('article');
    expect(note).toHaveTextContent('Area VM CZ · Area VM');
    expect(note).toHaveTextContent(en['review.statusAnswered']);
    expect(note).not.toHaveTextContent(en['state.overdue']); // answered, so past deadlines no longer matter
  });

  test('only the feedback of the previous version is in the comparison, not that of the current one', () => {
    renderPage({
      z: correctedZone({ state: 'needs_correction' }),
      feedbacks: [answered({ comment: 'Old remark' }), feedback({ id: 'n', version: 2, comment: 'New remark', status: 'open' })],
    });
    const comparison = within(screen.getByRole('region', { name: en['review.beforeAfter'] }));
    expect(comparison.getByText('Old remark')).toBeInTheDocument();
    expect(comparison.queryByText('New remark')).not.toBeInTheDocument();
    expect(within(photoSection(1)).getByText('New remark')).toBeInTheDocument();
  });

  test('versions older than the previous one are in the history below, with their feedback', () => {
    const z = correctedZone({
      versions: [
        { n: 1, photos: [versionPhoto(1, 1)], storeComment: 'First try', createdAt: Date.UTC(2026, 9, 12, 9) },
        { n: 2, photos: [versionPhoto(1, 2)], storeComment: 'Second try', createdAt: Date.UTC(2026, 9, 13, 9) },
        { n: 3, photos: [versionPhoto(1, 3)], storeComment: 'Third try', createdAt: Date.UTC(2026, 9, 14, 9) },
      ],
    });
    renderPage({
      z,
      feedbacks: [answered({ id: 'v1', version: 1, comment: 'About the first' }), answered({ id: 'v2', version: 2, comment: 'About the second' })],
    });
    const comparison = within(screen.getByRole('region', { name: en['review.beforeAfter'] }));
    expect(comparison.getByText('About the second')).toBeInTheDocument();
    expect(comparison.queryByText('About the first')).not.toBeInTheDocument();

    const history = screen.getByRole('region', { name: 'Version 1' });
    expect(history).toHaveTextContent('First try');
    expect(history).toHaveTextContent('About the first');
    expect(screen.queryByRole('region', { name: 'Version 2' })).not.toBeInTheDocument(); // that is the "before"
    expect(screen.queryByRole('region', { name: 'Version 3' })).not.toBeInTheDocument(); // and that is the current one
  });
});
