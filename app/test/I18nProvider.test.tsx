import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import { ro } from '@shared/i18n/ro';
import { useT } from '../src/i18n/I18nProvider';
import { SettingsPage } from '../src/ui/SettingsPage';
import { renderApp, signedIn, signedOut } from './helpers';
import type { Lang } from '@shared/types';

const fs = vi.hoisted(() => ({ doc: vi.fn(), updateDoc: vi.fn() }));

vi.mock('firebase/firestore', () => fs);
vi.mock('../src/firebase', () => ({ auth: {}, db: { name: 'test-db' } }));

function Probe() {
  const { lang, t } = useT();
  return <p>{lang}: {t('nav.settings')}</p>;
}

beforeEach(() => {
  fs.doc.mockReset().mockImplementation((_db, ...path: string[]) => ({ path: path.join('/') }));
  fs.updateDoc.mockReset().mockResolvedValue(undefined);
});

describe('useT', () => {
  test('uses the language from the profile', () => {
    renderApp(<Probe />, { session: signedIn('store', 'ro') });
    expect(screen.getByText(`ro: ${ro['nav.settings']}`)).toBeInTheDocument();
  });

  test('defaults to English without a profile', () => {
    renderApp(<Probe />, { session: signedOut });
    expect(screen.getByText(`en: ${en['nav.settings']}`)).toBeInTheDocument();
  });

  test('falls back to English for a language it does not know', () => {
    renderApp(<Probe />, { session: signedIn('store', 'de' as Lang) });
    expect(screen.getByText(`en: ${en['nav.settings']}`)).toBeInTheDocument();
  });

  test('sets the document language', async () => {
    renderApp(<Probe />, { session: signedIn('store', 'cs') });
    await waitFor(() => expect(document.documentElement.lang).toBe('cs'));
  });
});

describe('setLang (through the Settings page)', () => {
  test('choosing a language writes users/{uid}.language', async () => {
    renderApp(<SettingsPage />, { session: signedIn('store', 'en') });

    await userEvent.setup().click(screen.getByRole('radio', { name: 'Română' }));

    expect(fs.doc).toHaveBeenCalledWith({ name: 'test-db' }, 'users', 'u1');
    expect(fs.updateDoc).toHaveBeenCalledWith({ path: 'users/u1' }, { language: 'ro' });
  });

  test('a failed write shows the generic error as a toast', async () => {
    fs.updateDoc.mockRejectedValue(new Error('offline'));
    renderApp(<SettingsPage />, { session: signedIn('store', 'en') });

    await userEvent.setup().click(screen.getByRole('radio', { name: 'Čeština' }));

    expect(await screen.findByRole('status')).toHaveTextContent(en['error.generic']);
  });
});
