import {
  collection, doc, onSnapshot, orderBy, query, where,
} from 'firebase/firestore';
import type { DocumentReference, Query, Unsubscribe } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { useEffect, useMemo, useState } from 'react';
import type { Claims, Country, FeedbackDoc, ReportDoc, StoreDef, ZoneDoc } from '@shared/types';
import { db, storage } from '../firebase';

export interface Live<T> { data: T; loading: boolean; error: Error | null }

type Subscribe<T> = (next: (data: T) => void, fail: (error: Error) => void) => Unsubscribe;

/** Shared empty list, so a hook that has no data yet returns the same array on every render. */
const NONE: never[] = [];

/**
 * One Firestore listener per `key` (the key stands for everything `subscribe` depends on), removed on unmount
 * or when the key changes. A null key means there is nothing to read: no listener, not loading.
 * A result remembers its key, so data of a previous key is never shown for the next one.
 */
function useLive<T>(key: string | null, empty: T, subscribe: Subscribe<T>): Live<T> {
  const [result, setResult] = useState<{ key: string; data: T; error: Error | null } | null>(null);

  useEffect(() => {
    if (key === null) return;
    return subscribe(
      (data) => setResult({ key, data, error: null }),
      (error) => setResult({ key, data: empty, error }),
    );
    // `subscribe` and `empty` follow from `key`, so only a new key opens a new listener.
  }, [key]);

  return useMemo(() => {
    if (key === null) return { data: empty, loading: false, error: null };
    if (result?.key !== key) return { data: empty, loading: true, error: null };
    return { data: result.data, loading: false, error: result.error };
  }, [key, empty, result]);
}

/** Documents of a query, each with its id. `build` runs only when the listener opens, never for a disabled hook. */
function listen<T>(build: () => Query): Subscribe<T[]> {
  return (next, fail) => onSnapshot(
    build(),
    (snap) => next(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T)),
    fail,
  );
}

/** One document with its id; null when it does not exist. */
function listenDoc<T>(build: () => DocumentReference): Subscribe<T | null> {
  return (next, fail) => onSnapshot(
    build(),
    (snap) => next(snap.exists() ? ({ ...snap.data(), id: snap.id }) as T : null),
    fail,
  );
}

/** The reports of one store (a store may only read its own), newest first. An empty id reads nothing. */
export function useStoreReports(storeId: string): Live<ReportDoc[]> {
  return useLive(storeId ? `storeReports/${storeId}` : null, NONE as ReportDoc[], listen(
    () => query(collection(db, 'reports'), where('storeId', '==', storeId), orderBy('createdAt', 'desc')),
  ));
}

/**
 * Sent reports, newest sent first. Head of VM and Director read every country or the one asked for;
 * Area VM and Area Manager always only their own country (the rules reject any broader query);
 * everyone else, or an area user without a country, reads nothing.
 */
export function useSentReports(claims: Claims, country: Country | 'all'): Live<ReportDoc[]> {
  let scope: Country | 'all' | null = null;
  if (claims.role === 'head_vm' || claims.role === 'director') scope = country;
  else if (claims.role === 'avm' || claims.role === 'am') scope = claims.country;
  return useLive(scope === null ? null : `sentReports/${scope}`, NONE as ReportDoc[], listen(() => query(
    collection(db, 'reports'),
    where('status', '==', 'sent'),
    ...(scope === 'all' || scope === null ? [] : [where('country', '==', scope)]),
    orderBy('sentAt', 'desc'),
  )));
}

export function useReport(id: string): Live<ReportDoc | null> {
  return useLive(id ? `report/${id}` : null, null, listenDoc<ReportDoc>(() => doc(db, 'reports', id)));
}

export function useZones(reportId: string): Live<ZoneDoc[]> {
  return useLive(reportId ? `zones/${reportId}` : null, NONE as ZoneDoc[], listen(
    () => query(collection(db, 'reports', reportId, 'zones'), orderBy('order', 'asc')),
  ));
}

export function useZone(reportId: string, zoneId: string): Live<ZoneDoc | null> {
  return useLive(reportId && zoneId ? `zone/${reportId}/${zoneId}` : null, null, listenDoc<ZoneDoc>(() => doc(db, 'reports', reportId, 'zones', zoneId)));
}

export function useFeedback(reportId: string, zoneId: string): Live<FeedbackDoc[]> {
  return useLive(reportId && zoneId ? `feedback/${reportId}/${zoneId}` : null, NONE as FeedbackDoc[], listen(
    () => query(collection(db, 'reports', reportId, 'zones', zoneId, 'feedback'), orderBy('createdAt', 'asc')),
  ));
}

export function useStore(storeId: string): Live<StoreDef | null> {
  return useLive(storeId ? `store/${storeId}` : null, null, listenDoc<StoreDef>(() => doc(db, 'stores', storeId)));
}

/** Download URLs by Storage path. A URL does not change for a path, so each is fetched once per page load. */
const urlCache = new Map<string, string>();
const urlRequests = new Map<string, Promise<string>>();

function fetchPhotoUrl(path: string): Promise<string> {
  let request = urlRequests.get(path);
  if (!request) {
    request = getDownloadURL(ref(storage, path))
      .then((url) => { urlCache.set(path, url); return url; })
      .finally(() => { urlRequests.delete(path); });
    urlRequests.set(path, request);
  }
  return request;
}

/** The download URL of a stored photo; null until it is known (or when it cannot be fetched). */
export function usePhotoUrl(path: string): string | null {
  const [fetched, setFetched] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!path || urlCache.has(path)) return;
    let cancelled = false;
    fetchPhotoUrl(path).then(
      (url) => { if (!cancelled) setFetched({ path, url }); },
      () => undefined, // not cached, so the next screen that shows this photo asks again
    );
    return () => { cancelled = true; };
  }, [path]);

  if (!path) return null;
  return urlCache.get(path) ?? (fetched?.path === path ? fetched.url : null);
}
