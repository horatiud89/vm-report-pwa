import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Claims, Country, Role, UserDoc } from '@shared/types';
import { auth, db } from '../firebase';
import { disablePush } from '../push/push';

export interface Session {
  user: User | null;
  /** Null for a signed-out user and for a token that was read fine but carries no valid role (no access). */
  claims: Claims | null;
  /** The token could not be read (offline, flaky network): says nothing about access; `retryClaims` tries again. */
  claimsError: boolean;
  retryClaims: () => void;
  /** The users/{uid} document; null until it arrives or when it does not exist. */
  profile: UserDoc | null;
  loading: boolean;
  /** The one place that ends a session: removes this device's push token from the user, then signs out. */
  logout: () => Promise<void>;
}

export const AuthContext = createContext<Session | null>(null);

/** How long the first screen waits for the profile (language) before showing in English; offline it may never come. */
const PROFILE_WAIT_MS = 3000;

/** How long the first screen waits for the token claims before offering a retry (the SDK itself may take 30 s). */
const CLAIMS_WAIT_MS = 8000;

/** How long logout waits for the push cleanup; offline its Firestore write is never confirmed. */
const PUSH_CLEANUP_WAIT_MS = 3000;

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
  const [claimsOf, setClaimsOf] = useState<{ user: User; claims: Claims | null; failed: boolean } | null>(null);
  const [claimsAttempt, setClaimsAttempt] = useState(0);
  const [profileOf, setProfileOf] = useState<{ user: User; profile: UserDoc | null } | null>(null);

  useEffect(() => onAuthStateChanged(auth, (next) => setAuthState({ ready: true, user: next })), []);

  const user = authState.ready ? authState.user : null;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // A retry forces a refresh of the token; the first read may use the cached one.
    user.getIdTokenResult(claimsAttempt > 0).then(
      (result) => { if (!cancelled) setClaimsOf({ user, claims: parseClaims(result.claims), failed: false }); },
      () => { if (!cancelled) setClaimsOf({ user, claims: null, failed: true }); },
    );
    // Do not wait on the SDK's own network timeout; a late result still replaces this one.
    const giveUp = setTimeout(
      () => setClaimsOf((current) => (current?.user === user ? current : { user, claims: null, failed: true })),
      CLAIMS_WAIT_MS,
    );
    return () => { cancelled = true; clearTimeout(giveUp); };
  }, [user, claimsAttempt]);

  const retryClaims = useCallback(() => {
    setClaimsOf(null);
    setClaimsAttempt((n) => n + 1);
  }, []);

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

  const uid = user?.uid;
  const logout = useCallback(async () => {
    if (uid) {
      // Before signing out, while the write is still allowed. Its errors never block logout, nor does a slow one.
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        disablePush(uid).catch(() => undefined),
        new Promise((resolve) => { timer = setTimeout(resolve, PUSH_CLEANUP_WAIT_MS); }),
      ]);
      clearTimeout(timer);
    }
    await signOut(auth);
  }, [uid]);

  const claimsHere = user !== null && claimsOf?.user === user ? claimsOf : null;
  const profileHere = user !== null && profileOf?.user === user ? profileOf : null;
  const claimsError = claimsHere?.failed ?? false;

  // Back online after a failed read: try again without waiting for a tap.
  useEffect(() => {
    if (!claimsError) return;
    window.addEventListener('online', retryClaims);
    return () => window.removeEventListener('online', retryClaims);
  }, [claimsError, retryClaims]);

  const session = useMemo<Session>(() => ({
    user,
    claims: claimsHere?.claims ?? null,
    claimsError,
    retryClaims,
    profile: profileHere?.profile ?? null,
    loading: !authState.ready || (user !== null && (!claimsHere || !profileHere)),
    logout,
  }), [authState.ready, user, claimsHere, claimsError, profileHere, retryClaims, logout]);

  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(AuthContext);
  if (!session) throw new Error('useSession must be used inside AuthProvider');
  return session;
}
