import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import { STORE_850 } from '@shared/store850';
import type { ReportDoc, ZoneState, ZoneSummary } from '@shared/types';
import { OverviewPage } from '../src/review/OverviewPage';
import { BADGE_STYLE } from '../src/ui/badgeStyle';
import { live, makeReport } from './fixtures';
import { renderApp, signedIn } from './helpers';

const hooks = vi.hoisted(() => ({ useSentReports: vi.fn(), useStore: vi.fn() }));
vi.mock('../src/data/hooks', () => hooks);
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));

const NOW = Date.UTC(2026, 9, 15, 10); // 12:00 on 15 Oct in Prague
const SENT = Date.UTC(2026, 9, 14, 8);

const zone = (state: ZoneState, deadline: string | null = null): ZoneSummary => ({ state, deadline });
const sent = (over: Partial<ReportDoc> = {}) => makeReport({ status: 'sent', sentAt: SENT, ...over });

// 2 zones need correction (one is past its deadline in Prague), 5 are approved.
const SUMMARY: Record<string, ZoneSummary> = {
  'women-image': zone('needs_correction', '2026-10-14'),
  'women-wall-1': zone('needs_correction', '2026-10-20'),
  'women-wall-2': zone('approved'),
  'women-table-1': zone('approved'),
  'women-table-2': zone('approved'),
  'men-wall-1': zone('approved'),
  'men-wall-2': zone('approved'),
};

const NEWER_850 = sent({ id: 'new850', campaignName: 'Autumn 2026', sentAt: SENT, zoneSummary: SUMMARY });
const NEWER_120 = sent({
  id: 'new120', storeId: '120', storeCode: '120', storeName: 'Nový Smíchov', country: 'SK', campaignName: 'Winter 2026',
  sentAt: SENT - 1000, zoneSummary: { 'women-image': zone('submitted') },
});
const OLDER_850 = sent({
  id: 'old850', campaignName: 'Summer 2026', sentAt: SENT - 5000, zoneSummary: { 'women-image': zone('approved'), 'women-wall-1': zone('approved') },
});
const OLDER_120 = sent({ id: 'old120', storeId: '120', storeCode: '120', storeName: 'Nový Smíchov', country: 'SK', campaignName: 'Spring 2026', sentAt: SENT - 9000 });

function renderOverview(role: 'avm' | 'am' | 'head_vm' | 'director' = 'head_vm', reports: ReportDoc[] = [NEWER_850]) {
  hooks.useSentReports.mockReturnValue(live(reports));
  const session = signedIn(role, 'en', role === 'avm' || role === 'am' ? { country: 'CZ' } : {});
  return { session, ...renderApp(<OverviewPage />, { session }) };
}

const card = (name: RegExp) => screen.getByRole('link', { name }).closest('li') as HTMLElement;
const counter = (inCard: HTMLElement, state: ZoneState | 'overdue') => within(inCard).getByText(en[`state.${state}`]).closest('li') as HTMLElement;
const filter = () => screen.getByRole('combobox', { name: en['review.country'] });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  hooks.useSentReports.mockReset();
  hooks.useStore.mockReset().mockImplementation((id: string) => live(id ? { ...STORE_850, id } : null));
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('OverviewPage: a store card', () => {
  test('shows the latest sent report of each store only, newest first', () => {
    renderOverview('head_vm', [NEWER_850, NEWER_120, OLDER_850, OLDER_120]);
    const names = screen.getAllByRole('link').map((a) => a.textContent);
    expect(names).toHaveLength(2);
    expect(names[0]).toContain('850 Palladium Praha');
    expect(names[1]).toContain('120 Nový Smíchov');
    expect(screen.getByText(/Autumn 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Winter 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Summer 2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Spring 2026/)).not.toBeInTheDocument();
  });

  test('the card shows store code and name, country, campaign and sent date, and opens the report', () => {
    renderOverview('head_vm', [NEWER_850, NEWER_120]);
    const link = screen.getByRole('link', { name: /850 Palladium Praha/ });
    expect(link).toHaveAttribute('href', '/r/new850');
    expect(link).toHaveTextContent('CZ');
    expect(link).toHaveTextContent('Autumn 2026');
    expect(link).toHaveTextContent('14 Oct 2026');
    expect(screen.getByRole('link', { name: /120 Nový Smíchov/ })).toHaveAttribute('href', '/r/new120');
    expect(screen.getByRole('link', { name: /120 Nový Smíchov/ })).toHaveTextContent('SK');
  });

  test('the counters come from the latest report: overdue is counted apart from needs correction, not twice', () => {
    renderOverview('head_vm', [NEWER_850, OLDER_850]);
    const c = card(/850 Palladium Praha/);
    expect(counter(c, 'needs_correction')).toHaveTextContent(/^1\s*Needs correction$/);
    expect(counter(c, 'overdue')).toHaveTextContent(/^1\s*Overdue$/);
    expect(counter(c, 'approved')).toHaveTextContent(/^5\s*Approved$/);
  });

  test('overdue is judged on the date in the report time zone: past midnight in Prague, still the 14th in UTC', () => {
    vi.setSystemTime(Date.UTC(2026, 9, 14, 22, 30)); // 00:30 on 15 Oct in Prague
    renderOverview('head_vm', [sent({ zoneSummary: { 'women-image': zone('needs_correction', '2026-10-14'), 'women-wall-1': zone('needs_correction', '2026-10-15') } })]);
    const c = card(/850/);
    expect(counter(c, 'needs_correction')).toHaveTextContent(/^1\s*Needs correction$/); // due today is not overdue yet
    expect(counter(c, 'overdue')).toHaveTextContent(/^1\s*Overdue$/);
  });

  test('a report without corrections or approvals counts zero everywhere', () => {
    renderOverview('head_vm', [NEWER_120]);
    const c = card(/120/);
    for (const state of ['needs_correction', 'overdue', 'approved'] as const) {
      expect(counter(c, state)).toHaveTextContent(/^0\s/);
    }
  });
});

describe('OverviewPage: zone grid', () => {
  test('one square per zone of the report, in groups named by department, in the store order', () => {
    renderOverview();
    expect(screen.getAllByRole('img')).toHaveLength(Object.keys(SUMMARY).length); // zones the report has, no more
    const women = screen.getByRole('group', { name: "WOMEN'S DEPARTMENT" });
    expect(within(women).getAllByRole('img').map((s) => s.getAttribute('aria-label'))).toEqual([
      "Women's Image: Overdue",
      "Women's Wall 1: Needs correction",
      "Women's Wall 2: Approved",
      "Women's Table 1: Approved",
      "Women's Table 2: Approved",
    ]);
    expect(within(screen.getByRole('group', { name: "MEN'S DEPARTMENT" })).getAllByRole('img')).toHaveLength(2);
    expect(screen.queryByRole('group', { name: 'HOME' })).not.toBeInTheDocument(); // no zone of it in this report
  });

  test('a square names its zone and status in its title and its label; overdue and approved squares differ in colour', () => {
    renderOverview();
    const overdue = screen.getByLabelText("Women's Image: Overdue");
    expect(overdue).toHaveAttribute('title', "Women's Image: Overdue");
    expect(overdue).toHaveStyle({ backgroundColor: BADGE_STYLE.overdue.backgroundColor });
    expect(screen.getByLabelText("Women's Wall 1: Needs correction")).toHaveStyle({ backgroundColor: BADGE_STYLE.needs_correction.backgroundColor });
    expect(screen.getByLabelText("Women's Wall 2: Approved")).toHaveStyle({ backgroundColor: BADGE_STYLE.approved.backgroundColor });
    expect(BADGE_STYLE.overdue.backgroundColor).not.toBe(BADGE_STYLE.needs_correction.backgroundColor);
  });

  test('squares are named in the user language', () => {
    hooks.useSentReports.mockReturnValue(live([NEWER_850]));
    renderApp(<OverviewPage />, { session: signedIn('head_vm', 'ro') });
    expect(screen.getByLabelText("Women's Image: Termen depășit")).toBeInTheDocument();
  });

  test('without the store definition the card still shows, with no grid', () => {
    hooks.useStore.mockReturnValue({ data: null, loading: true, error: null });
    renderOverview();
    expect(screen.getByRole('link', { name: /850 Palladium Praha/ })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('OverviewPage: states', () => {
  test('says so when no report has been sent', () => {
    renderOverview('head_vm', []);
    expect(screen.getByText(en['overview.empty'])).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('a busy indicator while loading and the generic error when the reports cannot be read', () => {
    hooks.useSentReports.mockReturnValue({ data: [], loading: true, error: null });
    const { container, unmount } = renderApp(<OverviewPage />, { session: signedIn('head_vm') });
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    unmount();

    hooks.useSentReports.mockReturnValue({ data: [], loading: false, error: new Error('permission-denied') });
    renderApp(<OverviewPage />, { session: signedIn('head_vm') });
    expect(screen.getByRole('alert')).toHaveTextContent(en['error.generic']);
  });
});

describe('OverviewPage: country filter', () => {
  test.each(['head_vm', 'director'] as const)('%s can pick All countries, CZ, SK or RO', (role) => {
    renderOverview(role);
    expect(within(filter()).getAllByRole('option').map((o) => o.textContent)).toEqual([en['review.allCountries'], 'CZ', 'SK', 'RO']);
    expect(hooks.useSentReports).toHaveBeenLastCalledWith(expect.objectContaining({ role }), 'all');
  });

  test.each(['avm', 'am'] as const)('%s has no filter and always reads their own country', (role) => {
    renderOverview(role);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(hooks.useSentReports).toHaveBeenLastCalledWith(expect.objectContaining({ role, country: 'CZ' }), 'all');
  });

  test('uses the country remembered by the report list, and what is picked here is remembered for it', async () => {
    localStorage.setItem('vm-review-country', 'SK');
    const user = userEvent.setup({ advanceTimers: () => undefined });
    const { session } = renderOverview();
    expect(filter()).toHaveValue('SK');
    expect(hooks.useSentReports).toHaveBeenLastCalledWith(session.claims, 'SK');

    await user.selectOptions(filter(), 'RO');
    expect(hooks.useSentReports).toHaveBeenLastCalledWith(session.claims, 'RO');
    expect(localStorage.getItem('vm-review-country')).toBe('RO');
  });
});
