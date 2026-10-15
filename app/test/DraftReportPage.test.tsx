import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import { STORE_850 } from '@shared/store850';
import * as api from '../src/api';
import { DraftReportPage } from '../src/store/DraftReportPage';
import { clearZoneSessions, sessionFor } from '../src/store/zoneSession';
import * as compress from '../src/photos/compress';
import { allZoneDocs, live, makeReport, makeZone, photo } from './fixtures';
import { renderApp, signedIn } from './helpers';

const hooks = vi.hoisted(() => ({ useReport: vi.fn(), useZones: vi.fn(), useStore: vi.fn() }));
vi.mock('../src/data/hooks', () => hooks);
vi.mock('../src/api', () => ({ sendReport: vi.fn(), updateDraftZone: vi.fn() }));
vi.mock('../src/photos/compress', () => ({ uploadZonePhoto: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderPage(zones = allZoneDocs(), report = makeReport()) {
  hooks.useReport.mockReturnValue(live(report));
  hooks.useZones.mockReturnValue(live(zones));
  hooks.useStore.mockReturnValue(live(STORE_850));
  return renderApp(
    <>
      <Routes>
        <Route path="/r/:reportId" element={<DraftReportPage />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </>,
    { session: signedIn('store'), route: '/r/r1' },
  );
}

const sendButton = () => screen.getByRole('button', { name: en['store.send'] });

beforeEach(() => {
  clearZoneSessions();
  vi.mocked(api.sendReport).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.updateDraftZone).mockReset().mockResolvedValue(undefined);
  vi.mocked(compress.uploadZonePhoto).mockReset();
});

describe('DraftReportPage: send', () => {
  test('with an empty zone Send is disabled and the hint explains why', () => {
    renderPage(allZoneDocs('photo_added', { 'men-wall-1': 'empty' }));
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText(en['store.sendHint'])).toBeInTheDocument();
  });

  test('a report of only not-in-campaign zones cannot be sent', () => {
    renderPage(allZoneDocs('not_in_campaign'));
    expect(sendButton()).toBeDisabled();
  });

  test('with every zone done Send is enabled, hides the hint and calls sendReport with the report id', async () => {
    renderPage(allZoneDocs('photo_added', { 'women-wall-1': 'not_in_campaign' }));
    expect(sendButton()).toBeEnabled();
    expect(screen.queryByText(en['store.sendHint'])).not.toBeInTheDocument();

    await userEvent.setup().click(sendButton());

    expect(api.sendReport).toHaveBeenCalledWith({ reportId: 'r1' });
    expect(await screen.findByText(en['store.sent'])).toBeInTheDocument();
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  test('sends only once however often the button is tapped, and is disabled while sending', async () => {
    let finish!: () => void;
    vi.mocked(api.sendReport).mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    renderPage(allZoneDocs('photo_added'));
    const user = userEvent.setup();

    await user.click(sendButton());
    expect(sendButton()).toBeDisabled();
    await user.click(sendButton());
    expect(api.sendReport).toHaveBeenCalledTimes(1);

    finish();
    expect(await screen.findByText(en['store.sent'])).toBeInTheDocument();
  });

  test('a failed send shows the generic error, stays on the report and can be tried again', async () => {
    vi.mocked(api.sendReport).mockRejectedValueOnce(new Error('network'));
    renderPage(allZoneDocs('photo_added'));
    const user = userEvent.setup();

    await user.click(sendButton());

    expect(await screen.findByText(en['error.generic'])).toBeInTheDocument();
    expect(screen.getByTestId('where').textContent).toBe('/r/r1');
    expect(sendButton()).toBeEnabled();
    await user.click(sendButton());
    expect(api.sendReport).toHaveBeenCalledTimes(2);
  });
});

describe('DraftReportPage: zone edits still being saved', () => {
  const file = () => new File([new Uint8Array(4)], 'a.jpg', { type: 'image/jpeg' });
  /** The user took a photo in a zone and went back to the report before it was stored and saved. */
  const photoInFlight = (report = makeReport()) => sessionFor(report, makeZone('women-image')).addPhoto(file());

  test('Send is disabled, with the Saving hint, while a zone uploads; it is enabled once the zone is saved', async () => {
    let finish!: (p: ReturnType<typeof photo>) => void;
    vi.mocked(compress.uploadZonePhoto).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderPage(allZoneDocs('photo_added'));
    expect(sendButton()).toBeEnabled();

    act(() => { void photoInFlight(); });
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText(en['store.saving'])).toBeInTheDocument();

    await act(async () => finish(photo(1)));
    await waitFor(() => expect(sendButton()).toBeEnabled());
    expect(screen.queryByText(en['store.saving'])).not.toBeInTheDocument();
    expect(api.updateDraftZone).toHaveBeenCalledWith(expect.objectContaining({ reportId: 'r1', photos: [photo(1)] }));
  });

  test('Send is disabled while the save request of a zone is running', async () => {
    let finishSave!: () => void;
    vi.mocked(api.updateDraftZone).mockReturnValue(new Promise<void>((resolve) => { finishSave = resolve; }));
    vi.mocked(compress.uploadZonePhoto).mockResolvedValue(photo(1));
    renderPage(allZoneDocs('photo_added'));

    await act(async () => { await photoInFlight(); });
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText(en['store.saving'])).toBeInTheDocument();

    await act(async () => finishSave());
    expect(sendButton()).toBeEnabled();
  });

  test('a zone of another report does not hold this report back', () => {
    vi.mocked(compress.uploadZonePhoto).mockReturnValue(new Promise(() => undefined));
    renderPage(allZoneDocs('photo_added'));
    act(() => { void photoInFlight(makeReport({ id: 'other' })); });
    expect(sendButton()).toBeEnabled();
  });

  test('a save that failed blocks Send, says so, and Try again saves it', async () => {
    vi.mocked(compress.uploadZonePhoto).mockResolvedValue(photo(1));
    vi.mocked(api.updateDraftZone).mockRejectedValueOnce(new Error('offline'));
    renderPage(allZoneDocs('photo_added'));
    const user = userEvent.setup();

    await act(async () => { await photoInFlight(); });
    expect(sendButton()).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(en['error.generic']);

    await user.click(screen.getByRole('button', { name: en['common.retry'] }));
    await waitFor(() => expect(sendButton()).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.updateDraftZone).toHaveBeenCalledTimes(2);
  });

  test('a sent report has no Send button and is not affected', () => {
    vi.mocked(compress.uploadZonePhoto).mockReturnValue(new Promise(() => undefined));
    renderPage(allZoneDocs('submitted'), makeReport({ status: 'sent', sentAt: 5 }));
    act(() => { void photoInFlight(); });
    expect(screen.queryByRole('button', { name: en['store.send'] })).not.toBeInTheDocument();
  });
});

describe('DraftReportPage: zone list', () => {
  test('shows the campaign name and five uppercase department headings in store order', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Autumn 2026');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["WOMEN'S DEPARTMENT", "MEN'S DEPARTMENT", 'ACC', 'HOME', 'WINDOW']);
  });

  test('lists all 33 zones with their English name and state badge, each linking to its editor', () => {
    renderPage(allZoneDocs('empty', { 'women-image': 'photo_added', 'window-window-1': 'not_in_campaign' }));
    const zoneLinks = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/r/r1/z/'));
    expect(zoneLinks).toHaveLength(33);

    const image = screen.getByRole('link', { name: /Women's Image/ });
    expect(image).toHaveAttribute('href', '/r/r1/z/women-image');
    expect(within(image).getByText(en['state.photo_added'])).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Window 1/ })).getByText(en['state.not_in_campaign'])).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Men's Wall 1/ })).getByText(en['state.empty'])).toBeInTheDocument();
  });

  test('a zone appears under its own department', () => {
    renderPage();
    const home = screen.getByRole('heading', { name: 'HOME' }).closest('section') as HTMLElement;
    expect(within(home).getAllByRole('link').map((a) => a.textContent)).toEqual([
      expect.stringContaining('Home wall'), expect.stringContaining('Small table'), expect.stringContaining('Large table'),
    ]);
  });

  test('a sent report is read-only: no Send button or hint, the zones still open', () => {
    renderPage(allZoneDocs('submitted'), makeReport({ status: 'sent', sentAt: 5 }));
    expect(screen.queryByRole('button', { name: en['store.send'] })).not.toBeInTheDocument();
    expect(screen.queryByText(en['store.sendHint'])).not.toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Women's Image/ })).getByText(en['state.submitted'])).toBeInTheDocument();
  });

  test('on a sent report an overdue correction shows the Overdue badge', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
    try {
      const zones = allZoneDocs('submitted');
      zones[0] = { ...zones[0]!, state: 'needs_correction', earliestOpenDeadline: '2026-10-10' };
      zones[1] = { ...zones[1]!, state: 'needs_correction', earliestOpenDeadline: '2026-10-20' };
      renderPage(zones, makeReport({ status: 'sent', sentAt: 5 }));
      expect(within(screen.getByRole('link', { name: /Women's Image/ })).getByText(en['state.overdue'])).toBeInTheDocument();
      expect(within(screen.getByRole('link', { name: /Women's Wall 1/ })).getByText(en['state.needs_correction'])).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('DraftReportPage: loading and missing data', () => {
  test('shows the busy indicator while the report loads', () => {
    hooks.useReport.mockReturnValue({ data: null, loading: true, error: null });
    hooks.useZones.mockReturnValue({ data: [], loading: true, error: null });
    hooks.useStore.mockReturnValue({ data: null, loading: true, error: null });
    const { container } = renderApp(
      <Routes><Route path="/r/:reportId" element={<DraftReportPage />} /></Routes>,
      { session: signedIn('store'), route: '/r/r1' },
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  test('a report that does not exist sends the user home', () => {
    hooks.useReport.mockReturnValue(live(null));
    hooks.useZones.mockReturnValue(live([]));
    hooks.useStore.mockReturnValue(live(STORE_850));
    renderApp(
      <>
        <Routes><Route path="/r/:reportId" element={<DraftReportPage />} /><Route path="*" element={<Where />} /></Routes>
      </>,
      { session: signedIn('store'), route: '/r/missing' },
    );
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  test('a read error shows the generic message', () => {
    hooks.useReport.mockReturnValue({ data: null, loading: false, error: new Error('denied') });
    hooks.useZones.mockReturnValue(live([]));
    hooks.useStore.mockReturnValue(live(STORE_850));
    renderApp(
      <Routes><Route path="/r/:reportId" element={<DraftReportPage />} /></Routes>,
      { session: signedIn('store'), route: '/r/r1' },
    );
    expect(screen.getByRole('alert')).toHaveTextContent(en['error.generic']);
  });
});
