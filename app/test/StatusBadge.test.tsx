import { screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ro } from '@shared/i18n/ro';
import type { ZoneState } from '@shared/types';
import { StatusBadge } from '../src/ui/StatusBadge';
import { renderApp, signedIn } from './helpers';

vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));

describe('StatusBadge', () => {
  test('shows the label in the signed-in user language (ro) on a red background for needs_correction', () => {
    renderApp(<StatusBadge state="needs_correction" />, { session: signedIn('store', 'ro') });
    const badge = screen.getByText(ro['state.needs_correction']);
    expect(badge).toHaveStyle({ backgroundColor: '#d32f2f' });
  });

  test('defaults to English without a profile language', () => {
    renderApp(<StatusBadge state="approved" />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  test.each<[ZoneState | 'overdue', string]>([
    ['empty', '#d9d9d9'],
    ['not_in_campaign', '#8c8c8c'],
    ['overdue', '#8e0000'],
    ['correction_sent', '#ef6c00'],
    ['approved', '#2e7d32'],
  ])('%s is filled with %s', (state, colour) => {
    renderApp(<StatusBadge state={state} />);
    expect(screen.getByText(/./)).toHaveStyle({ backgroundColor: colour });
  });

  test.each<ZoneState>(['photo_added', 'submitted'])('%s is a black outline on white', (state) => {
    renderApp(<StatusBadge state={state} />);
    expect(screen.getByText(/./)).toHaveStyle({ backgroundColor: '#ffffff', color: '#000000', borderColor: '#000000' });
  });
});
