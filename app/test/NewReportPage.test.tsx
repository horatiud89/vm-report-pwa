import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import type { ReportDoc } from '@shared/types';
import * as api from '../src/api';
import { NewReportPage } from '../src/store/NewReportPage';
import { makeReport } from './fixtures';
import { renderApp, signedIn } from './helpers';

/** The live list of the store's reports, changeable from a test like a Firestore snapshot would change. */
const feed = vi.hoisted(() => {
  let reports: unknown[] = [];
  const listeners = new Set<() => void>();
  return {
    get: () => reports,
    set(next: unknown[]) { reports = next; listeners.forEach((l) => l()); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
});
vi.mock('../src/data/hooks', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useStoreReports: () => ({ data: useSyncExternalStore(feed.subscribe, feed.get), loading: false, error: null }) };
});
vi.mock('../src/api', () => ({ createDraft: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderPage(reports: ReportDoc[] = []) {
  feed.set(reports);
  return renderApp(
    <>
      <Routes><Route path="/new" element={<NewReportPage />} /><Route path="*" element={null} /></Routes>
      <Where />
    </>,
    { session: signedIn('store'), route: '/new' },
  );
}

const nameInput = () => screen.getByLabelText(en['store.campaignName']);
const submit = () => screen.getByRole('button', { name: en['store.startReport'] });
const failedPrecondition = () => Object.assign(new Error('already a draft'), { code: 'functions/failed-precondition' });

beforeEach(() => {
  vi.mocked(api.createDraft).mockReset().mockResolvedValue({ reportId: 'new1' });
});

describe('NewReportPage', () => {
  test('the campaign name is required and limited to 80 characters', async () => {
    renderPage();
    expect(nameInput()).toHaveAttribute('maxLength', '80');
    expect(nameInput()).toBeRequired();
    expect(submit()).toBeDisabled();

    await userEvent.setup().type(nameInput(), '   ');
    expect(submit()).toBeDisabled();
  });

  test('creates the draft with the trimmed name and opens it', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(nameInput(), '  Autumn 2026 ');
    await user.click(submit());

    expect(api.createDraft).toHaveBeenCalledWith({ campaignName: 'Autumn 2026' });
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/r/new1'));
  });

  test('submits with Enter and only once while the call is running', async () => {
    let finish!: (v: { reportId: string }) => void;
    vi.mocked(api.createDraft).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderPage();
    const user = userEvent.setup();
    await user.type(nameInput(), 'Autumn{Enter}');
    expect(submit()).toBeDisabled();
    await user.type(nameInput(), '{Enter}');
    expect(api.createDraft).toHaveBeenCalledTimes(1);
    finish({ reportId: 'new1' });
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/r/new1'));
  });

  test('another failure shows the generic error and keeps the typed name', async () => {
    vi.mocked(api.createDraft).mockRejectedValue(new Error('network'));
    renderPage();
    const user = userEvent.setup();
    await user.type(nameInput(), 'Autumn');
    await user.click(submit());

    expect(await screen.findByText(en['error.generic'])).toBeInTheDocument();
    expect(nameInput()).toHaveValue('Autumn');
    expect(screen.getByTestId('where').textContent).toBe('/new');
    expect(submit()).toBeEnabled();
  });

  test('a store that already has a draft is taken to it, with the notice', async () => {
    renderPage([makeReport({ id: 'd' })]);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/r/d'));
    expect(screen.getByText(en['store.draftExists'])).toBeInTheDocument();
    expect(api.createDraft).not.toHaveBeenCalled();
  });

  test('failed-precondition from the server (a draft made elsewhere) opens that draft once it arrives', async () => {
    vi.mocked(api.createDraft).mockRejectedValue(failedPrecondition());
    renderPage([]);
    const user = userEvent.setup();
    await user.type(nameInput(), 'Autumn');
    await user.click(submit());

    // The draft is not in the live list yet: say so, stay on the page.
    expect(await screen.findByText(en['store.draftExists'])).toBeInTheDocument();
    expect(screen.getByTestId('where').textContent).toBe('/new');

    act(() => feed.set([makeReport({ id: 'elsewhere' })]));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/r/elsewhere'));
  });
});
