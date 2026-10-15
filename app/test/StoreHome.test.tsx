import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import { STORE_850 } from '@shared/store850';
import type { ReportDoc, ZoneSummary } from '@shared/types';
import { StoreHome } from '../src/store/StoreHome';
import { live, makeReport } from './fixtures';
import { renderApp, signedIn } from './helpers';

const hooks = vi.hoisted(() => ({ useStoreReports: vi.fn(), useStore: vi.fn() }));
vi.mock('../src/data/hooks', () => hooks);
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderHome(reports: ReportDoc[], lang: 'en' | 'ro' = 'en') {
  hooks.useStoreReports.mockReturnValue(live(reports));
  hooks.useStore.mockReturnValue(live(STORE_850));
  return renderApp(
    <>
      <Routes><Route path="/" element={<StoreHome />} /><Route path="*" element={null} /></Routes>
      <Where />
    </>,
    { session: signedIn('store', lang), route: '/' },
  );
}

const sent = (id: string, summary: Record<string, ZoneSummary>, over: Partial<ReportDoc> = {}) =>
  makeReport({ id, campaignName: `Campaign ${id}`, status: 'sent', sentAt: Date.UTC(2026, 9, 1, 8), zoneSummary: summary, ...over });
const needs = (deadline: string): ZoneSummary => ({ state: 'needs_correction', deadline });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('StoreHome: corrections to do', () => {
  const reports = [
    sent('a', { 'women-wall-1': needs('2026-10-20'), 'women-image': { state: 'approved', deadline: null } }),
    sent('b', { 'men-wall-1': needs('2026-10-10'), 'home-small-table': needs('2026-10-12') }),
  ];

  test('lists each zone that needs correction, soonest deadline first', () => {
    renderHome(reports);
    const section = screen.getByRole('heading', { name: en['store.correctionsToDo'] }).closest('section') as HTMLElement;
    const rows = within(section).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Men's Wall 1"),
      expect.stringContaining('Small table'),
      expect.stringContaining("Women's Wall 1"),
    ]);
  });

  test('each row names the campaign, shows the deadline as day.month and opens the zone', () => {
    renderHome(reports);
    const link = screen.getByRole('link', { name: /Women's Wall 1/ });
    expect(link).toHaveAttribute('href', '/r/a/z/women-wall-1');
    expect(link).toHaveTextContent('Campaign a');
    expect(link).toHaveTextContent('Deadline 20.10');
  });

  test('past deadlines are marked overdue (red); today and later are not', () => {
    renderHome(reports);
    const overdue = screen.getByRole('link', { name: /Men's Wall 1/ });
    expect(within(overdue).getByText(en['state.overdue'])).toBeInTheDocument();
    expect(within(overdue).getByText('Deadline 10.10')).toHaveClass('is-overdue');
    expect(within(screen.getByRole('link', { name: /Small table/ })).getByText(en['state.overdue'])).toBeInTheDocument();

    const upcoming = screen.getByRole('link', { name: /Women's Wall 1/ });
    expect(within(upcoming).getByText(en['state.needs_correction'])).toBeInTheDocument();
    expect(within(upcoming).queryByText(en['state.overdue'])).not.toBeInTheDocument();
    expect(within(upcoming).getByText('Deadline 20.10')).not.toHaveClass('is-overdue');
  });

  test('a deadline of today is not overdue yet, in the store time zone', () => {
    vi.setSystemTime(new Date('2026-10-19T22:30:00Z')); // 00:30 on the 20th in Prague
    renderHome([sent('a', { 'women-wall-1': needs('2026-10-20') })]);
    expect(screen.queryByText(en['state.overdue'])).not.toBeInTheDocument();
    vi.setSystemTime(new Date('2026-10-20T22:30:00Z')); // 00:30 on the 21st in Prague
    renderHome([sent('b', { 'women-wall-1': needs('2026-10-20') })]);
    expect(screen.getByText(en['state.overdue'])).toBeInTheDocument();
  });

  test('is hidden when nothing needs correction', () => {
    renderHome([sent('a', { 'women-image': { state: 'correction_sent', deadline: null } })]);
    expect(screen.queryByRole('heading', { name: en['store.correctionsToDo'] })).not.toBeInTheDocument();
  });

  test('uses the user language for the labels', () => {
    renderHome(reports, 'ro');
    expect(screen.getByRole('heading', { name: 'Corecturi de făcut' })).toBeInTheDocument();
    expect(screen.getByText('Termen 20.10')).toBeInTheDocument();
  });
});

describe('StoreHome: report list', () => {
  test('shows campaign, date and status of each report, newest first as the hook delivers them', () => {
    renderHome([
      makeReport({ id: 'd', campaignName: 'Winter draft', createdAt: Date.UTC(2026, 9, 14, 8) }),
      sent('s', { 'women-image': { state: 'submitted', deadline: null } }, { sentAt: Date.UTC(2026, 9, 1, 8) }),
      sent('c', { 'women-image': needs('2026-10-20'), 'women-wall-1': { state: 'correction_sent', deadline: null } }),
      sent('p', { 'women-image': { state: 'approved', deadline: null }, 'women-wall-1': { state: 'not_in_campaign', deadline: null } }),
    ]);
    const items = within(screen.getByRole('heading', { name: en['nav.home'], level: 2 }).closest('section') as HTMLElement).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Winter draft');
    expect(items[0]).toHaveTextContent(en['report.draft']);
    expect(items[0]).toHaveTextContent('14');
    expect(items[1]).toHaveTextContent('Campaign s');
    expect(items[1]).toHaveTextContent(en['report.sent']);
    expect(items[1]).toHaveTextContent('2026');
    expect(items[2]).toHaveTextContent('Corrections open (2)');
    expect(items[3]).toHaveTextContent(en['report.approved']);
  });

  test('every report opens at /r/{id}', () => {
    renderHome([makeReport({ id: 'd', campaignName: 'Winter draft' }), sent('s', {})]);
    expect(screen.getByRole('link', { name: /Winter draft/ })).toHaveAttribute('href', '/r/d');
    expect(screen.getByRole('link', { name: /Campaign s/ })).toHaveAttribute('href', '/r/s');
  });

  test('says so when there are no reports yet', () => {
    renderHome([]);
    expect(screen.getByText(en['store.noReports'])).toBeInTheDocument();
  });

  test('shows the busy indicator while loading and the generic message on a read error', () => {
    hooks.useStoreReports.mockReturnValue({ data: [], loading: true, error: null });
    hooks.useStore.mockReturnValue(live(STORE_850));
    const first = renderApp(<StoreHome />, { session: signedIn('store') });
    expect(first.container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    first.unmount();

    hooks.useStoreReports.mockReturnValue({ data: [], loading: false, error: new Error('denied') });
    renderApp(<StoreHome />, { session: signedIn('store') });
    expect(screen.getByRole('alert')).toHaveTextContent(en['error.generic']);
  });

  test('reads the reports of the store from the session claims', () => {
    renderHome([]);
    expect(hooks.useStoreReports).toHaveBeenCalledWith('850');
  });
});

describe('StoreHome: New report', () => {
  test('without a draft the button goes to /new', async () => {
    renderHome([sent('s', {})]);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: en['store.newReport'] }));
    expect(screen.getByTestId('where').textContent).toBe('/new');
    expect(screen.queryByText(en['store.draftExists'])).not.toBeInTheDocument();
  });

  test('with a draft the button opens that draft and says a draft already exists', async () => {
    renderHome([makeReport({ id: 'd', campaignName: 'Winter draft' }), sent('s', {})]);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: en['store.newReport'] }));
    expect(screen.getByTestId('where').textContent).toBe('/r/d');
    expect(screen.getByText(en['store.draftExists'])).toBeInTheDocument();
  });
});
