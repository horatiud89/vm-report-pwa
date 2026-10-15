import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import type { PhotoRef, ReportDoc, ZoneDoc } from '@shared/types';
import * as api from '../src/api';
import * as compress from '../src/photos/compress';
import { DraftZonePage } from '../src/store/DraftZonePage';
import { clearZoneSessions } from '../src/store/zoneSession';
import { live, makeReport, makeZone, photo } from './fixtures';
import { renderApp, signedIn } from './helpers';

const hooks = vi.hoisted(() => ({ useReport: vi.fn(), useZone: vi.fn(), usePhotoUrl: vi.fn() }));
vi.mock('../src/data/hooks', () => hooks);
vi.mock('../src/api', () => ({ updateDraftZone: vi.fn() }));
vi.mock('../src/photos/compress', () => ({ uploadZonePhoto: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function zoneWith(photos: PhotoRef[], over: Partial<ZoneDoc> = {}, storeComment = ''): ZoneDoc {
  return makeZone('women-image', {
    state: photos.length ? 'photo_added' : 'empty',
    versions: [{ n: 1, photos, storeComment, createdAt: 1 }],
    ...over,
  });
}

function renderZone(zone: ZoneDoc | null = zoneWith([]), report: ReportDoc = makeReport()) {
  hooks.useReport.mockReturnValue(live(report));
  hooks.useZone.mockReturnValue(live(zone));
  return renderApp(
    <>
      <Routes>
        <Route path="/r/:reportId/z/:zoneId" element={<DraftZonePage />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </>,
    { session: signedIn('store'), route: '/r/r1/z/women-image' },
  );
}

const payload = (over: Partial<Parameters<typeof api.updateDraftZone>[0]> = {}) => ({
  reportId: 'r1', zoneId: 'women-image', photos: [], storeComment: '', notInCampaign: false, ...over,
});
const jpeg = (name = 'a.jpg') => new File([new Uint8Array(4)], name, { type: 'image/jpeg' });
const cameraInput = (c: HTMLElement) => c.querySelector('input[type="file"][capture]') as HTMLInputElement;
const galleryInput = (c: HTMLElement) => c.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
const comment = () => screen.getByLabelText(en['store.comment']);
const toggle = () => screen.getByRole('checkbox', { name: en['store.notInCampaign'] });
const removeButtons = () => screen.queryAllByRole('button', { name: en['store.removePhoto'] });

beforeEach(() => {
  clearZoneSessions();
  hooks.usePhotoUrl.mockImplementation((path: string) => (path ? `https://img.test/${path}` : null));
  vi.mocked(api.updateDraftZone).mockReset().mockResolvedValue(undefined);
  vi.mocked(compress.uploadZonePhoto).mockReset();
});

describe('DraftZonePage: picking photos', () => {
  test('shows the zone name, the counter, and two ways to add a photo', () => {
    const { container } = renderZone();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Women's Image");
    expect(screen.getByText('Add photo (0/3)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['store.takePhoto'] })).toBeEnabled();
    expect(screen.getByRole('button', { name: en['store.choosePhoto'] })).toBeEnabled();

    const camera = cameraInput(container);
    expect(camera).toHaveAttribute('accept', 'image/*');
    expect(camera).toHaveAttribute('capture', 'environment');
    const gallery = galleryInput(container);
    expect(gallery).toHaveAttribute('accept', 'image/*');
    expect(gallery).not.toHaveAttribute('capture');
  });

  test('each button opens its own file input', async () => {
    const { container } = renderZone();
    const user = userEvent.setup();
    const opened: HTMLInputElement[] = [];
    for (const input of [cameraInput(container), galleryInput(container)]) {
      input.addEventListener('click', (e) => { e.preventDefault(); opened.push(input); });
    }
    await user.click(screen.getByRole('button', { name: en['store.takePhoto'] }));
    await user.click(screen.getByRole('button', { name: en['store.choosePhoto'] }));
    expect(opened).toEqual([cameraInput(container), galleryInput(container)]);
  });

  test('uploads the picked photo with a progress bar, then saves the zone at once and shows it', async () => {
    let progress!: (fraction: number) => void;
    let finish!: (p: PhotoRef) => void;
    vi.mocked(compress.uploadZonePhoto).mockImplementation((_r, _z, _v, _f, onProgress) => {
      progress = onProgress!;
      return new Promise((resolve) => { finish = resolve; });
    });
    const report = makeReport();
    const { container } = renderZone(zoneWith([]), report);
    const file = jpeg();

    await userEvent.setup().upload(cameraInput(container), file);

    expect(compress.uploadZonePhoto).toHaveBeenCalledWith(report, 'women-image', 1, file, expect.any(Function));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    act(() => progress(0.4));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText('Uploading… 40%')).toBeInTheDocument();
    expect(api.updateDraftZone).not.toHaveBeenCalled();

    await act(async () => finish(photo(1)));

    await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledWith(payload({ photos: [photo(1)] })));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Photo 1' })).toHaveAttribute('src', `https://img.test/${photo(1).path}`);
    expect(await screen.findByText(en['store.saved'])).toBeInTheDocument();
    expect(screen.getByText('Add photo (1/3)')).toBeInTheDocument();
  });

  test('works the same for a photo from the gallery', async () => {
    vi.mocked(compress.uploadZonePhoto).mockResolvedValue(photo(1));
    const { container } = renderZone();
    await userEvent.setup().upload(galleryInput(container), jpeg());
    await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledWith(payload({ photos: [photo(1)] })));
  });

  test('a photo added to a zone that already has photos is appended and the whole list saved', async () => {
    vi.mocked(compress.uploadZonePhoto).mockResolvedValue(photo(2));
    const { container } = renderZone(zoneWith([photo(1)], {}, 'Wall done'));
    await userEvent.setup().upload(cameraInput(container), jpeg());
    await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledWith(
      payload({ photos: [photo(1), photo(2)], storeComment: 'Wall done' }),
    ));
  });

  test('a failed upload shows the error, saves nothing and keeps the photos already saved', async () => {
    vi.mocked(compress.uploadZonePhoto).mockRejectedValue(new Error('storage/retry-limit-exceeded'));
    const { container } = renderZone(zoneWith([photo(1)]));
    await userEvent.setup().upload(cameraInput(container), jpeg());

    expect(await screen.findByText(en['error.generic'])).toBeInTheDocument();
    expect(api.updateDraftZone).not.toHaveBeenCalled();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Photo 1' })).toBeInTheDocument();
    expect(screen.getByText('Add photo (1/3)')).toBeInTheDocument();
  });

  test('at 3 photos both buttons are disabled and the counter reads 3/3', () => {
    renderZone(zoneWith([photo(1), photo(2), photo(3)]));
    expect(screen.getByText('Add photo (3/3)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['store.takePhoto'] })).toBeDisabled();
    expect(screen.getByRole('button', { name: en['store.choosePhoto'] })).toBeDisabled();
  });

  test('photos still uploading count towards the limit of 3', async () => {
    vi.mocked(compress.uploadZonePhoto).mockReturnValue(new Promise(() => undefined));
    const { container } = renderZone(zoneWith([photo(1), photo(2)]));
    await userEvent.setup().upload(cameraInput(container), jpeg());

    expect(screen.getByText('Add photo (3/3)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['store.takePhoto'] })).toBeDisabled();
  });
});

describe('DraftZonePage: removing photos', () => {
  test('Remove drops that photo and saves the remaining ones at once', async () => {
    renderZone(zoneWith([photo(1), photo(2)], {}, 'keep'));
    expect(removeButtons()).toHaveLength(2);

    await userEvent.setup().click(removeButtons()[0]!);

    await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledWith(payload({ photos: [photo(2)], storeComment: 'keep' })));
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByText('Add photo (1/3)')).toBeInTheDocument();
  });

  test('removing the last photo saves an empty zone', async () => {
    renderZone(zoneWith([photo(1)]));
    await userEvent.setup().click(removeButtons()[0]!);
    await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledWith(payload({ photos: [] })));
  });
});

describe('DraftZonePage: not part of this campaign', () => {
  test('the toggle is disabled while the zone has photos', () => {
    renderZone(zoneWith([photo(1)]));
    expect(toggle()).toBeDisabled();
  });

  test('the toggle is disabled while a photo is uploading', async () => {
    vi.mocked(compress.uploadZonePhoto).mockReturnValue(new Promise(() => undefined));
    const { container } = renderZone();
    await userEvent.setup().upload(cameraInput(container), jpeg());
    expect(toggle()).toBeDisabled();
  });

  test('turning it on saves at once, keeps the comment and blocks adding photos', async () => {
    renderZone(zoneWith([], {}, 'not in our store'));
    expect(toggle()).toBeEnabled();
    expect(toggle()).not.toBeChecked();

    await userEvent.setup().click(toggle());

    await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledWith(payload({ notInCampaign: true, storeComment: 'not in our store' })));
    expect(toggle()).toBeChecked();
    expect(screen.getByRole('button', { name: en['store.takePhoto'] })).toBeDisabled();
    expect(screen.getByRole('button', { name: en['store.choosePhoto'] })).toBeDisabled();
  });

  test('a zone already marked starts checked, and turning it off saves', async () => {
    renderZone(zoneWith([], { state: 'not_in_campaign' }));
    expect(toggle()).toBeChecked();
    await userEvent.setup().click(toggle());
    await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledWith(payload({ notInCampaign: false })));
    expect(screen.getByRole('button', { name: en['store.takePhoto'] })).toBeEnabled();
  });
});

describe('DraftZonePage: comment auto-save', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Fake timers and user-event's own waiting do not mix, so these tests drive the field with plain events.
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const type = (text: string) => fireEvent.change(comment(), { target: { value: text } });

  test('saves 800 ms after the last keystroke, once, with the text so far', async () => {
    renderZone();
    type('P');
    type('Přeskládat');
    expect(api.updateDraftZone).not.toHaveBeenCalled();

    await advance(799);
    expect(api.updateDraftZone).not.toHaveBeenCalled();
    await advance(1);
    expect(api.updateDraftZone).toHaveBeenCalledTimes(1);
    expect(api.updateDraftZone).toHaveBeenCalledWith(payload({ storeComment: 'Přeskládat' }));

    await advance(5000);
    expect(api.updateDraftZone).toHaveBeenCalledTimes(1);
    expect(screen.getByText(en['store.saved'])).toBeInTheDocument();
  });

  test('typing again restarts the wait', async () => {
    renderZone();
    type('ab');
    await advance(500);
    type('abcd');
    await advance(500);
    expect(api.updateDraftZone).not.toHaveBeenCalled();
    await advance(300);
    expect(api.updateDraftZone).toHaveBeenCalledTimes(1);
    expect(api.updateDraftZone).toHaveBeenCalledWith(payload({ storeComment: 'abcd' }));
  });

  test('leaving the field saves at once and cancels the wait', async () => {
    renderZone();
    type('abc');
    await act(async () => { fireEvent.blur(comment()); });
    expect(api.updateDraftZone).toHaveBeenCalledTimes(1);
    expect(api.updateDraftZone).toHaveBeenCalledWith(payload({ storeComment: 'abc' }));
    await advance(2000);
    expect(api.updateDraftZone).toHaveBeenCalledTimes(1);
  });

  test('visiting the field without typing saves nothing', async () => {
    renderZone();
    fireEvent.focus(comment());
    fireEvent.blur(comment());
    await advance(2000);
    expect(api.updateDraftZone).not.toHaveBeenCalled();
  });

  test('shows Saving… while the save runs and nothing while the text is still being typed', async () => {
    let finish!: () => void;
    vi.mocked(api.updateDraftZone).mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    renderZone();
    type('abc');
    expect(screen.queryByText(en['store.saved'])).not.toBeInTheDocument();
    expect(screen.queryByText(en['store.saving'])).not.toBeInTheDocument();

    await advance(800);
    expect(screen.getByText(en['store.saving'])).toBeInTheDocument();
    await act(async () => finish());
    expect(screen.getByText(en['store.saved'])).toBeInTheDocument();
  });

  test('leaving the page within the wait still saves the comment', async () => {
    const { unmount } = renderZone();
    type('last words');
    expect(api.updateDraftZone).not.toHaveBeenCalled();
    unmount();
    expect(api.updateDraftZone).toHaveBeenCalledTimes(1);
    expect(api.updateDraftZone).toHaveBeenCalledWith(payload({ storeComment: 'last words' }));
    await advance(2000);
    expect(api.updateDraftZone).toHaveBeenCalledTimes(1);
  });

  test('a failed save toasts the generic error, keeps the text and Try again saves it', async () => {
    vi.mocked(api.updateDraftZone).mockRejectedValueOnce(new Error('offline'));
    renderZone();
    type('keep me');
    await advance(800);

    expect(screen.getAllByText(en['error.generic']).length).toBeGreaterThan(0);
    expect(comment()).toHaveValue('keep me');
    expect(screen.queryByText(en['store.saved'])).not.toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: en['common.retry'] })); });
    expect(api.updateDraftZone).toHaveBeenCalledTimes(2);
    expect(api.updateDraftZone).toHaveBeenLastCalledWith(payload({ storeComment: 'keep me' }));
    expect(screen.getByText(en['store.saved'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en['common.retry'] })).not.toBeInTheDocument();
  });

  test('limits the comment to 500 characters', () => {
    renderZone();
    expect(comment()).toHaveAttribute('maxLength', '500');
  });

  test('starts with the saved comment of the zone', () => {
    renderZone(zoneWith([], {}, 'Přeskládat'));
    expect(comment()).toHaveValue('Přeskládat');
  });
});

describe('DraftZonePage: saves never overlap', () => {
  test('a change made while a save runs is sent after it, with the latest state of the whole zone', async () => {
    let first!: () => void;
    vi.mocked(api.updateDraftZone).mockImplementationOnce(() => new Promise<void>((resolve) => { first = resolve; }));
    renderZone(zoneWith([photo(1), photo(2)]));
    const user = userEvent.setup();

    await user.click(removeButtons()[0]!);
    await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledTimes(1));
    await user.click(removeButtons()[0]!);
    expect(api.updateDraftZone).toHaveBeenCalledTimes(1);
    expect(screen.getByText(en['store.saving'])).toBeInTheDocument();

    await act(async () => first());

    await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledTimes(2));
    expect(api.updateDraftZone).toHaveBeenLastCalledWith(payload({ photos: [] }));
    expect(await screen.findByText(en['store.saved'])).toBeInTheDocument();
  });

  test('two uploads finishing in turn both end up in the zone', async () => {
    const finishers: Array<(p: PhotoRef) => void> = [];
    vi.mocked(compress.uploadZonePhoto).mockImplementation(() => new Promise((resolve) => { finishers.push(resolve); }));
    const { container } = renderZone();
    const user = userEvent.setup();
    await user.upload(cameraInput(container), jpeg('1.jpg'));
    await user.upload(galleryInput(container), jpeg('2.jpg'));

    await act(async () => finishers[1]!(photo(2)));
    await act(async () => finishers[0]!(photo(1)));

    await waitFor(() => expect(api.updateDraftZone).toHaveBeenLastCalledWith(payload({ photos: [photo(2), photo(1)] })));
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });
});

describe('DraftZonePage: edits survive leaving the zone', () => {
  test('an upload that finishes after the user left and came back is saved with the comment typed meanwhile', async () => {
    let finish!: (p: PhotoRef) => void;
    vi.mocked(compress.uploadZonePhoto).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const first = renderZone(zoneWith([]));
    await userEvent.setup().upload(cameraInput(first.container), jpeg());
    first.unmount(); // Back to the report ...

    renderZone(zoneWith([])); // ... and into the same zone again: the snapshot still has no photo
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Add photo (1/3)')).toBeInTheDocument();
    fireEvent.change(comment(), { target: { value: 'Missing tags' } });
    fireEvent.blur(comment());
    await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledWith(payload({ storeComment: 'Missing tags' })));

    await act(async () => finish(photo(1)));

    await waitFor(() => expect(api.updateDraftZone).toHaveBeenLastCalledWith(
      payload({ photos: [photo(1)], storeComment: 'Missing tags' }),
    ));
    // No save ever sent the photo without the comment, or the comment without the photo after it arrived.
    const sent = vi.mocked(api.updateDraftZone).mock.calls.map(([p]) => p);
    expect(sent.filter((p) => p.photos.length > 0 && p.storeComment === '')).toEqual([]);
    expect(screen.getByRole('img', { name: 'Photo 1' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  test('the same happens when the upload finishes while the user is away from the zone', async () => {
    let finish!: (p: PhotoRef) => void;
    vi.mocked(compress.uploadZonePhoto).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const first = renderZone(zoneWith([], {}, 'Wall done'));
    await userEvent.setup().upload(cameraInput(first.container), jpeg());
    first.unmount();

    await act(async () => finish(photo(1)));

    await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledWith(payload({ photos: [photo(1)], storeComment: 'Wall done' })));
    renderZone(zoneWith([], {}, 'Wall done')); // the snapshot has not caught up yet: the session still shows the photo
    expect(screen.getByRole('img', { name: 'Photo 1' })).toBeInTheDocument();
  });

  test('coming back shows the latest values of the earlier visit, not the older snapshot', async () => {
    const first = renderZone(zoneWith([photo(1), photo(2)], {}, 'old'));
    await userEvent.setup().click(removeButtons()[0]!);
    fireEvent.change(comment(), { target: { value: 'newer' } });
    first.unmount();

    renderZone(zoneWith([photo(1), photo(2)], {}, 'old'));
    expect(comment()).toHaveValue('newer');
    expect(screen.getAllByRole('img')).toHaveLength(1);
    await waitFor(() => expect(api.updateDraftZone).toHaveBeenLastCalledWith(payload({ photos: [photo(2)], storeComment: 'newer' })));
  });

  test('a failed save stays unsaved: retried on the next change, and on leaving the zone', async () => {
    vi.mocked(api.updateDraftZone).mockRejectedValueOnce(new Error('offline'));
    const first = renderZone(zoneWith([photo(1)]));
    fireEvent.change(comment(), { target: { value: 'keep me' } });
    fireEvent.blur(comment());
    expect(await screen.findByRole('button', { name: en['common.retry'] })).toBeInTheDocument();
    expect(api.updateDraftZone).toHaveBeenCalledTimes(1);

    // Next change: sends everything again, comment included.
    await userEvent.setup().click(removeButtons()[0]!);
    await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledTimes(2));
    expect(api.updateDraftZone).toHaveBeenLastCalledWith(payload({ photos: [], storeComment: 'keep me' }));

    // Leaving: a save that failed is tried once more.
    vi.mocked(api.updateDraftZone).mockRejectedValueOnce(new Error('offline'));
    fireEvent.change(comment(), { target: { value: 'keep me too' } });
    fireEvent.blur(comment());
    await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledTimes(3));
    await screen.findByRole('button', { name: en['common.retry'] });
    first.unmount();
    await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledTimes(4));
    expect(api.updateDraftZone).toHaveBeenLastCalledWith(payload({ photos: [], storeComment: 'keep me too' }));
  });

  test('an unsaved zone is kept for the next visit even when the snapshot is newer', async () => {
    vi.mocked(api.updateDraftZone).mockRejectedValue(new Error('offline'));
    const first = renderZone(zoneWith([]));
    fireEvent.change(comment(), { target: { value: 'not saved yet' } });
    fireEvent.blur(comment());
    await screen.findByRole('button', { name: en['common.retry'] });
    first.unmount();
    await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledTimes(2));

    renderZone(zoneWith([], {}, 'from the server'));
    expect(comment()).toHaveValue('not saved yet');
  });

  describe('once everything is saved', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test('a visit shortly after trusts the session (the snapshot may lag), a much later one reads the snapshot', async () => {
      const first = renderZone(zoneWith([]));
      fireEvent.change(comment(), { target: { value: 'mine' } });
      fireEvent.blur(comment());
      await waitFor(() => expect(api.updateDraftZone).toHaveBeenCalledTimes(1));
      await screen.findByText(en['store.saved']);
      first.unmount();

      vi.setSystemTime(new Date('2026-10-15T10:00:10Z'));
      const second = renderZone(zoneWith([], {}, 'older snapshot'));
      expect(comment()).toHaveValue('mine');
      second.unmount();

      vi.setSystemTime(new Date('2026-10-15T10:05:00Z'));
      renderZone(zoneWith([], {}, 'changed on another device'));
      expect(comment()).toHaveValue('changed on another device');
    });
  });
});

describe('DraftZonePage: saved status', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('does not say Saved while text typed during a save is still waiting to be saved', async () => {
    let finish!: () => void;
    vi.mocked(api.updateDraftZone).mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    renderZone();
    fireEvent.change(comment(), { target: { value: 'a' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(screen.getByText(en['store.saving'])).toBeInTheDocument();

    fireEvent.change(comment(), { target: { value: 'ab' } }); // typed while the first save is in flight
    await act(async () => finish());
    expect(screen.queryByText(en['store.saved'])).not.toBeInTheDocument();
    expect(api.updateDraftZone).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(api.updateDraftZone).toHaveBeenCalledTimes(2);
    expect(api.updateDraftZone).toHaveBeenLastCalledWith(payload({ storeComment: 'ab' }));
    expect(screen.getByText(en['store.saved'])).toBeInTheDocument();
  });
});

describe('DraftZonePage: navigation and states', () => {
  test('links back to the report', () => {
    renderZone();
    expect(screen.getByRole('link', { name: new RegExp(en['common.back']) })).toHaveAttribute('href', '/r/r1');
  });

  test('shows the busy indicator while loading', () => {
    hooks.useReport.mockReturnValue({ data: null, loading: true, error: null });
    hooks.useZone.mockReturnValue({ data: null, loading: true, error: null });
    const { container } = renderApp(
      <Routes><Route path="/r/:reportId/z/:zoneId" element={<DraftZonePage />} /></Routes>,
      { session: signedIn('store'), route: '/r/r1/z/women-image' },
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  test('a zone that does not exist goes back to the report', () => {
    renderZone(null);
    expect(screen.getByTestId('where').textContent).toBe('/r/r1');
  });

  test('a read error shows the generic message', () => {
    hooks.useReport.mockReturnValue(live(makeReport()));
    hooks.useZone.mockReturnValue({ data: null, loading: false, error: new Error('denied') });
    renderApp(
      <Routes><Route path="/r/:reportId/z/:zoneId" element={<DraftZonePage />} /></Routes>,
      { session: signedIn('store'), route: '/r/r1/z/women-image' },
    );
    expect(screen.getByRole('alert')).toHaveTextContent(en['error.generic']);
  });
});

describe('DraftZonePage: sent report', () => {
  test('is not an editor any more: a sent report goes back to its page (zones there open the correction screen)', () => {
    renderZone(zoneWith([photo(1)], { state: 'submitted' }), makeReport({ status: 'sent', sentAt: 5 }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/r\/r1$/);
    expect(screen.queryByLabelText(en['store.comment'])).not.toBeInTheDocument();
  });
});
