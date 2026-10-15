import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Claims, Country, Role, UserDoc } from '@shared/types';
import { auth, db } from '../firebase';

export interface Session {
  user: User | null;
  /** Null for a signed-out user and for an account without a (valid) role claim. */
  claims: Claims | null;
  /** The users/{uid} document; null until it arrives or when it does not exist. */
  profile: UserDoc | null;
  loading: boolean;
  /** The one place that ends a session; push cleanup is added here later. */
  logout: () => Promise<void>;
}

export const AuthContext = createContext<Session | null>(null);

/** How long the first screen waits for the profile (language) before showing in English; offline it may never come. */
const PROFILE_WAIT_MS = 3000;

const ROLES: readonly Role[] = ['store', 'avm', 'am', 'head_vm', 'director'];
const COUNTRIES: readonly Country[] = ['CZ', 'SK', 'RO'];

/** Claims from an ID token; anything without one of the five known roles is no access at all. */
function parseClaims(raw: Record<string, unknown>): Claims | null {
  const role = ROLES.find((r) => r === raw.role);
  if (!role) return null;
  const country = COUNTRIES.find((c) => c === raw.country) ?? null;
  const storeId = typeof raw.storeId === 'string' ? raw.storeId : null;
  return { role, country, storeId };
}

type AuthState = { ready: false } | { ready: true; user: User | null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({ ready: false });
  // Each result remembers the User it was loaded for, so a stale one (a previous sign-in) is never shown.
  const [claimsOf, setClaimsOf] = useState<{ user: User; claims: Claims | null } | null>(null);
  const [profileOf, setProfileOf] = useState<{ user: User; profile: UserDoc | null } | null>(null);

  useEffect(() => onAuthStateChanged(auth, (next) => setAuthState({ ready: true, user: next })), []);

  const user = authState.ready ? authState.user : null;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    user.getIdTokenResult().then(
      (result) => { if (!cancelled) setClaimsOf({ user, claims: parseClaims(result.claims) }); },
      () => { if (!cancelled) setClaimsOf({ user, claims: null }); },
    );
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => setProfileOf({ user, profile: snap.exists() ? (snap.data() as UserDoc) : null }),
      // No readable profile (e.g. rules deny it): carry on with the default language.
      () => setProfileOf({ user, profile: null }),
    );
    // Offline with nothing cached the first snapshot never arrives; do not keep the app on a blank screen.
    const giveUp = setTimeout(() => setProfileOf((current) => (current?.user === user ? current : { user, profile: null })), PROFILE_WAIT_MS);
    return () => { unsubscribe(); clearTimeout(giveUp); };
  }, [user]);

  const logout = useCallback(() => signOut(auth), []);

  const session = useMemo<Session>(() => {
    const claimsHere = user !== null && claimsOf?.user === user ? claimsOf : null;
    const profileHere = user !== null && profileOf?.user === user ? profileOf : null;
    return {
      user,
      claims: claimsHere?.claims ?? null,
      profile: profileHere?.profile ?? null,
      loading: !authState.ready || (user !== null && (!claimsHere || !profileHere)),
      logout,
    };
  }, [authState.ready, user, claimsOf, profileOf, logout]);

  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(AuthContext);
  if (!session) throw new Error('useSession must be used inside AuthProvider');
  return session;
}
