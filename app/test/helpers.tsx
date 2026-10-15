import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { Claims, Lang, Role, UserDoc } from '@shared/types';
import { AuthContext } from '../src/auth/AuthProvider';
import type { Session } from '../src/auth/AuthProvider';
import { I18nProvider } from '../src/i18n/I18nProvider';
import { ToastProvider } from '../src/ui/Toast';

export const signedOut: Session = { user: null, claims: null, profile: null, loading: false, logout: vi.fn() };

export function signedIn(role: Role, lang: Lang = 'en', extra: Partial<Claims> = {}): Session {
  const claims: Claims = { role, country: role === 'store' ? 'CZ' : null, storeId: role === 'store' ? '850' : null, ...extra };
  const profile: UserDoc = {
    email: 'someone@example.com', role, country: claims.country, storeId: claims.storeId,
    displayName: 'Someone', language: lang, fcmTokens: [],
  };
  return { user: { uid: 'u1' } as Session['user'], claims, profile, loading: false, logout: vi.fn() };
}

export function renderApp(ui: ReactElement, { session = signedOut, route = '/' }: { session?: Session; route?: string } = {}) {
  return render(
    <AuthContext.Provider value={session}>
      <I18nProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </ToastProvider>
      </I18nProvider>
    </AuthContext.Provider>,
  );
}
