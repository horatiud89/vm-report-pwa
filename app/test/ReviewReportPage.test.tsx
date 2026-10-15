import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import { STORE_850 } from '@shared/store850';
import type { ReportDoc, ZoneDoc } from '@shared/types';
import * as api from '../src/api';
import { exportReport } from '../src/pdf/exportReport';
import { ReviewReportPage } from '../src/review/ReviewReportPage';
import { allZoneDocs, live, makeReport, makeZone } from './fixtures';
import { renderApp, signedIn } from './helpers';

const hooks = vi.hoisted(() => ({ useReport: vi.fn(), useZones: vi.fn(), useStore: vi.fn() }));
vi.mock('../src/data/hooks', () => hooks);
vi.mock('../src/api', () => ({ markSeen: vi.fn(), approveAllWithoutFeedback: vi.fn() }));
vi.mock('../src/pdf/exportReport', () => ({ exportReport: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

/** 15 Oct 2026, noon in Prague. */
const NOW = Date.UTC(2026, 9, 15, 10);

const report = (over: Partial<ReportDoc> = {}) => makeReport({ status: 'sent', sentAt: Date.UTC(2026, 9, 14, 8), seenBy: [], ...over });

function renderPage({ r = report(), zones = allZoneDocs('submitted') }: { r?: ReportDoc | null; zones?: ZoneDoc[] } = {}) {
  hooks.useReport.mockReturnValue(live(r));
  hooks.useZones.mockReturnValue(live(zones));
  hooks.useStore.mockReturnValue(live(STORE_850));
  return renderApp(
    <>
      <Routes>
        <Route path="/r/:reportId" element={<ReviewReportPage />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </>,
    { session: signedIn('avm', 'en', { country: 'CZ' }), route: '/r/r1' },
  );
}

const approveAll = () => screen.queryByRole('button', { name: en['review.approveAll'] });
const exportPdf = () => screen.queryByRole('button', { name: en['review.exportPdf'] });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  hooks.useReport.mockReset();
  hooks.useZones.mockReset();
  hooks.useStore.mockReset();
  vi.mocked(api.markSeen).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.approveAllWithoutFeedback).mockReset().mockResolvedValue({ approved: 3 });
  vi.mocked(exportReport).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ReviewReportPage: the report', () => {
  test('shows the store, campaign, sent date and status, and the zones by department with their status', () => {
    renderPage({
      r: report({ zoneSummary: { 'women-image': { state: 'approved', deadline: null }, 'men-image': { state: 'needs_correction', deadline: '2026-10-20' }, 'women-table-1': { state: 'submitted', deadline: null } } }),
      zones: allZoneDocs('submitted', { 'women-image': 'approved', 'men-image': 'needs_correction' }),
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('850 Palladium Praha');
    expect(screen.getByText(/Autumn 2026/)).toHaveTextContent('CZ');
    expect(screen.getByText(/Autumn 2026/)).toHaveTextContent('14 Oct 2026');
    expect(screen.getByText('Corrections open (1)')).toBeInTheDocument();

    for (const department of STORE_850.departments) {
      expect(screen.getByRole('heading', { level: 2, name: department.name })).toBeInTheDocument();
    }
    const zone = screen.getByRole('link', { name: /Women's Image/ });
    expect(zone).toHaveAttribute('href', '/r/r1/z/women-image');
    expect(within(zone).getByText(en['state.approved'])).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Men's Image/ })).getByText(en['state.needs_correction'])).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Women's Table 1/ })).getByText(en['state.submitted'])).toBeInTheDocument();
  });

  test('a correction past its deadline reads Overdue, in the time zone of the store', () => {
    const zones = [
      makeZone('women-image', { state: 'needs_correction', earliestOpenDeadline: '2026-10-14' }),
      makeZone('men-image', { state: 'needs_correction', earliestOpenDeadline: '2026-10-15' }),
    ];
    renderPage({ zones });
    expect(within(screen.getByRole('link', { name: /Women's Image/ })).getByText(en['state.overdue'])).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Men's Image/ })).getByText(en['state.needs_correction'])).toBeInTheDocument();
  });

  test('a report that is not there sends the reviewer home', () => {
    renderPage({ r: null });
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  test('says something went wrong when the report cannot be read', () => {
    hooks.useReport.mockReturnValue({ data: null, loading: false, error: new Error('x') });
    hooks.useZones.mockReturnValue(live([]));
    hooks.useStore.mockReturnValue(live(null));
    renderApp(<ReviewReportPage />, { session: signedIn('avm', 'en', { country: 'CZ' }) });
    expect(screen.getByRole('alert')).toHaveTextContent(en['error.generic']);
  });
});

describe('ReviewReportPage: seen', () => {
  test('tells the server once that the reviewer opened the report', () => {
    renderPage();
    expect(api.markSeen).toHaveBeenCalledTimes(1);
    expect(api.markSeen).toHaveBeenCalledWith({ reportId: 'r1' });
  });

  test('still once when React runs the effect twice (development)', () => {
    hooks.useReport.mockReturnValue(live(report()));
    hooks.useZones.mockReturnValue(live(allZoneDocs('submitted')));
    hooks.useStore.mockReturnValue(live(STORE_850));
    renderApp(
      <StrictMode>
        <Routes>
          <Route path="/r/:reportId" element={<ReviewReportPage />} />
        </Routes>
      </StrictMode>,
      { session: signedIn('avm', 'en', { country: 'CZ' }), route: '/r/r1' },
    );
    expect(api.markSeen).toHaveBeenCalledTimes(1);
  });

  test('a failed markSeen is ignored', async () => {
    vi.mocked(api.markSeen).mockRejectedValue(new Error('functions/permission-denied'));
    renderPage();
    await waitFor(() => expect(api.markSeen).toHaveBeenCalled());
    expect(screen.queryByText(en['error.generic'])).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});

describe('ReviewReportPage: approve all without feedback', () => {
  test('is offered only while some zone is waiting for review (submitted)', () => {
    renderPage({ zones: allZoneDocs('approved', { 'women-image': 'submitted' }) });
    expect(approveAll()).toBeInTheDocument();
  });

  test.each(['approved', 'needs_correction', 'correction_sent', 'not_in_campaign'] as const)('is not offered when no zone is submitted (%s)', (state) => {
    renderPage({ zones: allZoneDocs(state) });
    expect(approveAll()).not.toBeInTheDocument();
  });

  test('asks first, then approves, and tells how many zones were approved', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage({ zones: allZoneDocs('approved', { 'women-image': 'submitted', 'men-image': 'submitted' }) });

    await user.click(approveAll()!);
    expect(confirm).toHaveBeenCalledWith(en['review.approveAllConfirm'].replace('{n}', '2'));
    expect(api.approveAllWithoutFeedback).toHaveBeenCalledWith({ reportId: 'r1' });
    expect(await screen.findByText('Zones approved: 3')).toBeInTheDocument();
  });

  test('does nothing when the reviewer cancels the question', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage();
    await user.click(approveAll()!);
    expect(api.approveAllWithoutFeedback).not.toHaveBeenCalled();
  });

  test('on error the reviewer sees the generic error and can try again', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.approveAllWithoutFeedback).mockRejectedValueOnce(new Error('functions/failed-precondition'));
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage();

    await user.click(approveAll()!);
    expect(await screen.findByText(en['error.generic'])).toBeInTheDocument();
    expect(approveAll()).toBeEnabled();

    await user.click(approveAll()!);
    expect(api.approveAllWithoutFeedback).toHaveBeenCalledTimes(2);
  });

  test('a second tap while the first is on its way approves nothing more', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let finish: (value: { approved: number }) => void = () => undefined;
    vi.mocked(api.approveAllWithoutFeedback).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage();

    await user.click(approveAll()!);
    expect(approveAll()).toBeDisabled();
    await user.click(approveAll()!);
    expect(api.approveAllWithoutFeedback).toHaveBeenCalledTimes(1);
    finish({ approved: 1 });
    expect(await screen.findByText('Zones approved: 1')).toBeInTheDocument();
  });
});

describe('ReviewReportPage: export PDF', () => {
  test('is offered whatever the state of the zones, also when nothing waits for review', () => {
    renderPage({ zones: allZoneDocs('approved') });
    expect(approveAll()).not.toBeInTheDocument();
    expect(exportPdf()).toBeEnabled();
  });

  test('makes the PDF of this report, with its zones, the language of the reviewer and the store', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    const zones = allZoneDocs('submitted', { 'women-image': 'approved' });
    renderPage({ zones });

    await user.click(exportPdf()!);
    expect(exportReport).toHaveBeenCalledTimes(1);
    expect(exportReport).toHaveBeenCalledWith(report(), zones, 'en', STORE_850);
  });

  test('hands over the language the reviewer uses', async () => {
    hooks.useReport.mockReturnValue(live(report()));
    hooks.useZones.mockReturnValue(live(allZoneDocs('submitted')));
    hooks.useStore.mockReturnValue(live(STORE_850));
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderApp(<ReviewReportPage />, { session: signedIn('avm', 'ro', { country: 'CZ' }) });

    await user.click(screen.getByRole('button', { name: 'Exportă PDF' }));
    expect(vi.mocked(exportReport).mock.calls[0]?.[2]).toBe('ro');
  });

  test('is disabled and says it is preparing while the PDF is made, and a second tap does nothing', async () => {
    let finish: () => void = () => undefined;
    vi.mocked(exportReport).mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage();

    await user.click(exportPdf()!);
    expect(exportPdf()).not.toBeInTheDocument();
    const busy = screen.getByRole('button', { name: en['pdf.preparing'] });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(exportReport).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(exportPdf()).toBeEnabled());
    expect(screen.queryByText(en['error.generic'])).not.toBeInTheDocument();
  });

  test('a failed export shows the generic error, keeps the page usable and can be tried again', async () => {
    vi.mocked(exportReport).mockRejectedValueOnce(new Error('storage/unauthorized'));
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage();

    await user.click(exportPdf()!);
    expect(await screen.findByText(en['error.generic'])).toBeInTheDocument();
    expect(exportPdf()).toBeEnabled();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('850 Palladium Praha');
    expect(approveAll()).toBeEnabled();

    await user.click(exportPdf()!);
    expect(exportReport).toHaveBeenCalledTimes(2);
  });

  test('exporting does not block Approve all without feedback', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(exportReport).mockReturnValue(new Promise<void>(() => undefined));
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage();

    await user.click(exportPdf()!);
    expect(approveAll()).toBeEnabled();
    await user.click(approveAll()!);
    expect(api.approveAllWithoutFeedback).toHaveBeenCalledTimes(1);
  });
});
