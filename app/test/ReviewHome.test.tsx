import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import type { ReportDoc } from '@shared/types';
import { ReviewHome } from '../src/review/ReviewHome';
import { live, makeReport } from './fixtures';
import { renderApp, signedIn } from './helpers';

const hooks = vi.hoisted(() => ({ useSentReports: vi.fn() }));
vi.mock('../src/data/hooks', () => hooks);
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));

const NOW = Date.UTC(2026, 9, 15, 10);
const SENT = Date.UTC(2026, 9, 14, 8);

const sent = (over: Partial<ReportDoc> = {}) => makeReport({ status: 'sent', sentAt: SENT, ...over });

const REPORTS = [
  sent({ id: 'r1', seenBy: [], zoneSummary: { a: { state: 'submitted', deadline: null } } }),
  sent({
    id: 'r2', storeCode: '120', storeName: 'Nový Smíchov', country: 'CZ', campaignName: 'Summer 2026', seenBy: ['u1'],
    zoneSummary: { a: { state: 'needs_correction', deadline: '2026-10-20' }, b: { state: 'correction_sent', deadline: null }, c: { state: 'approved', deadline: null } },
  }),
  sent({ id: 'r3', storeCode: '310', storeName: 'Aupark', country: 'SK', campaignName: 'Autumn 2026', seenBy: ['someone-else'], zoneSummary: { a: { state: 'approved', deadline: null } } }),
];

function renderHome(role: 'avm' | 'am' | 'head_vm' | 'director' = 'head_vm', reports: ReportDoc[] = REPORTS) {
  hooks.useSentReports.mockReturnValue(live(reports));
  const session = signedIn(role, 'en', role === 'avm' || role === 'am' ? { country: 'CZ' } : {});
  return { session, ...renderApp(<ReviewHome />, { session }) };
}

const filter = () => screen.getByRole('combobox', { name: en['review.country'] });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  hooks.useSentReports.mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ReviewHome: the list', () => {
  test('a row shows the store, country, campaign, sent date and the report status, and links to the report', () => {
    renderHome();
    const row = screen.getByRole('link', { name: /120 Nový Smíchov/ });
    expect(row).toHaveAttribute('href', '/r/r2');
    expect(row).toHaveTextContent('CZ');
    expect(row).toHaveTextContent('Summer 2026');
    expect(row).toHaveTextContent('14 Oct 2026');
    expect(row).toHaveTextContent('Corrections open (2)');

    expect(screen.getByRole('link', { name: /850 Palladium Praha/ })).toHaveTextContent('Sent');
    expect(screen.getByRole('link', { name: /310 Aupark/ })).toHaveTextContent('Approved');
    expect(screen.getByRole('link', { name: /310 Aupark/ })).toHaveTextContent('SK');
  });

  test('New marks the reports this reviewer has not opened yet', () => {
    renderHome();
    expect(within(screen.getByRole('link', { name: /850 Palladium Praha/ })).getByText(en['review.new'])).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /310 Aupark/ })).getByText(en['review.new'])).toBeInTheDocument(); // others saw it, not me
    expect(within(screen.getByRole('link', { name: /120 Nový Smíchov/ })).queryByText(en['review.new'])).not.toBeInTheDocument();
  });

  test('says so when there is nothing to review', () => {
    renderHome('head_vm', []);
    expect(screen.getByText(en['review.noReports'])).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('a busy indicator while loading and the generic error when the list cannot be read', () => {
    hooks.useSentReports.mockReturnValue({ data: [], loading: true, error: null });
    const { container, unmount } = renderApp(<ReviewHome />, { session: signedIn('head_vm') });
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    unmount();

    hooks.useSentReports.mockReturnValue({ data: [], loading: false, error: new Error('permission-denied') });
    renderApp(<ReviewHome />, { session: signedIn('head_vm') });
    expect(screen.getByRole('alert')).toHaveTextContent(en['error.generic']);
  });
});

describe('ReviewHome: country filter', () => {
  test.each(['head_vm', 'director'] as const)('%s can pick All countries, CZ, SK or RO', (role) => {
    renderHome(role);
    const options = within(filter()).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual([en['review.allCountries'], 'CZ', 'SK', 'RO']);
    expect(filter()).toHaveValue('all');
    expect(hooks.useSentReports).toHaveBeenLastCalledWith(expect.objectContaining({ role }), 'all');
  });

  test.each(['avm', 'am'] as const)('%s has no filter and always reads their own country', (role) => {
    renderHome(role);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(hooks.useSentReports).toHaveBeenLastCalledWith(expect.objectContaining({ role, country: 'CZ' }), 'all');
  });

  test('choosing a country reads that country and is remembered for next time', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    const { unmount, session } = renderHome();
    await user.selectOptions(filter(), 'SK');
    expect(hooks.useSentReports).toHaveBeenLastCalledWith(session.claims, 'SK');
    unmount();

    renderApp(<ReviewHome />, { session });
    expect(filter()).toHaveValue('SK');
    expect(hooks.useSentReports).toHaveBeenLastCalledWith(session.claims, 'SK');

    await user.selectOptions(filter(), en['review.allCountries']);
    expect(hooks.useSentReports).toHaveBeenLastCalledWith(session.claims, 'all');
  });

  test('a remembered value that is not a country is ignored', () => {
    localStorage.setItem('vm-review-country', 'DE');
    renderHome();
    expect(filter()).toHaveValue('all');
  });

  test('storage that cannot be read or written does not break the list or the filter', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const user = userEvent.setup({ advanceTimers: () => undefined });
    const { session } = renderHome();
    expect(screen.getByRole('link', { name: /850 Palladium Praha/ })).toBeInTheDocument();
    await user.selectOptions(filter(), 'RO');
    expect(filter()).toHaveValue('RO');
    expect(hooks.useSentReports).toHaveBeenLastCalledWith(session.claims, 'RO');
  });
});
