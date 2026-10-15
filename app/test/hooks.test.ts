import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Claims } from '@shared/types';
import {
  usePhotoUrl, useFeedback, useReport, useSentReports, useStore, useStoreReports, useZone, useZones,
} from '../src/data/hooks';

interface Listener { next: (snap: unknown) => void; error: (e: Error) => void; unsubscribe: ReturnType<typeof vi.fn> }

const fs = vi.hoisted(() => ({
  collection: vi.fn(), doc: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), onSnapshot: vi.fn(),
}));
const st = vi.hoisted(() => ({ ref: vi.fn(), getDownloadURL: vi.fn() }));
vi.mock('firebase/firestore', () => fs);
vi.mock('firebase/storage', () => st);
vi.mock('../src/firebase', () => ({ db: { name: 'db' }, storage: { name: 'storage' } }));

let listeners: Listener[] = [];

beforeEach(() => {
  listeners = [];
  fs.collection.mockReset().mockImplementation((_db: unknown, ...path: string[]) => ({ kind: 'collection', path: path.join('/') }));
  fs.doc.mockReset().mockImplementation((_db: unknown, ...path: string[]) => ({ kind: 'doc', path: path.join('/') }));
  fs.where.mockReset().mockImplementation((field: string, op: string, value: unknown) => ({ where: [field, op, value] }));
  fs.orderBy.mockReset().mockImplementation((field: string, dir: string) => ({ orderBy: [field, dir] }));
  fs.query.mockReset().mockImplementation((source: unknown, ...constraints: unknown[]) => ({ ...(source as object), constraints }));
  fs.onSnapshot.mockReset().mockImplementation((_source: unknown, next: Listener['next'], error: Listener['error']) => {
    const unsubscribe = vi.fn();
    listeners.push({ next, error, unsubscribe });
    return unsubscribe;
  });
  st.ref.mockReset().mockImplementation((_storage: unknown, path: string) => ({ fullPath: path }));
  st.getDownloadURL.mockReset();
});

const querySnap = (rows: Array<{ id: string } & Record<string, unknown>>) => ({
  docs: rows.map(({ id, ...data }) => ({ id, data: () => data })),
});
const docSnap = (row: ({ id: string } & Record<string, unknown>) | null) => ({
  exists: () => row !== null, id: row?.id, data: () => (row ? (({ id: _id, ...rest }) => rest)(row) : undefined),
});
const lastQuery = () => fs.onSnapshot.mock.calls.at(-1)![0] as { path: string; constraints?: unknown[] };

describe('useStoreReports', () => {
  test('asks for the reports of that store, newest first, and starts loading', () => {
    const { result } = renderHook(() => useStoreReports('850'));
    expect(result.current).toEqual({ data: [], loading: true, error: null });
    expect(lastQuery()).toEqual({
      kind: 'collection', path: 'reports', constraints: [{ where: ['storeId', '==', '850'] }, { orderBy: ['createdAt', 'desc'] }],
    });
  });

  test('delivers the documents with their id and follows later snapshots', () => {
    const { result } = renderHook(() => useStoreReports('850'));
    act(() => listeners[0]!.next(querySnap([{ id: 'a', campaignName: 'A' }, { id: 'b', campaignName: 'B' }])));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toMatchObject([{ id: 'a', campaignName: 'A' }, { id: 'b', campaignName: 'B' }]);

    act(() => listeners[0]!.next(querySnap([{ id: 'c' }])));
    expect(result.current.data).toMatchObject([{ id: 'c' }]);
  });

  test('stops listening when the component unmounts', () => {
    const { unmount } = renderHook(() => useStoreReports('850'));
    expect(listeners[0]!.unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(listeners[0]!.unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('keeps one listener across re-renders and switches listener when the store changes', () => {
    const { rerender } = renderHook(({ id }) => useStoreReports(id), { initialProps: { id: '850' } });
    rerender({ id: '850' });
    expect(listeners).toHaveLength(1);
    rerender({ id: '851' });
    expect(listeners).toHaveLength(2);
    expect(listeners[0]!.unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('a listener error is reported with empty data', () => {
    const { result } = renderHook(() => useStoreReports('850'));
    act(() => listeners[0]!.error(new Error('permission-denied')));
    expect(result.current.loading).toBe(false);
    expect(result.current.error?.message).toBe('permission-denied');
    expect(result.current.data).toEqual([]);
  });

  test('without a store id there is nothing to read and nothing is loading', () => {
    const { result } = renderHook(() => useStoreReports(''));
    expect(result.current).toEqual({ data: [], loading: false, error: null });
    expect(fs.onSnapshot).not.toHaveBeenCalled();
  });

  test('does not show the previous store while the next one loads', () => {
    const { result, rerender } = renderHook(({ id }) => useStoreReports(id), { initialProps: { id: '850' } });
    act(() => listeners[0]!.next(querySnap([{ id: 'a' }])));
    rerender({ id: '851' });
    expect(result.current).toEqual({ data: [], loading: true, error: null });
  });
});

describe('useSentReports', () => {
  const claims = (over: Partial<Claims>): Claims => ({ role: 'head_vm', country: null, storeId: null, ...over });
  const constraints = () => lastQuery().constraints;

  test('head of VM sees all countries: sent reports, newest sent first', () => {
    renderHook(() => useSentReports(claims({ role: 'head_vm' }), 'all'));
    expect(constraints()).toEqual([{ where: ['status', '==', 'sent'] }, { orderBy: ['sentAt', 'desc'] }]);
  });

  test('director can narrow to one country', () => {
    renderHook(() => useSentReports(claims({ role: 'director' }), 'SK'));
    expect(constraints()).toEqual([
      { where: ['status', '==', 'sent'] }, { where: ['country', '==', 'SK'] }, { orderBy: ['sentAt', 'desc'] },
    ]);
  });

  test.each(['avm', 'am'] as const)('%s is always limited to their own country, whatever is asked', (role) => {
    renderHook(() => useSentReports(claims({ role, country: 'CZ' }), 'RO'));
    expect(constraints()).toEqual([
      { where: ['status', '==', 'sent'] }, { where: ['country', '==', 'CZ'] }, { orderBy: ['sentAt', 'desc'] },
    ]);
  });

  test('an area user without a country, and a store user, read nothing', () => {
    const area = renderHook(() => useSentReports(claims({ role: 'avm', country: null }), 'all'));
    const store = renderHook(() => useSentReports(claims({ role: 'store', storeId: '850', country: 'CZ' }), 'all'));
    expect(fs.onSnapshot).not.toHaveBeenCalled();
    expect(area.result.current).toEqual({ data: [], loading: false, error: null });
    expect(store.result.current).toEqual({ data: [], loading: false, error: null });
  });
});

describe('useReport, useStore', () => {
  test('useReport reads one document by id; a missing document is null, not an error', () => {
    const { result } = renderHook(() => useReport('r1'));
    expect(fs.onSnapshot.mock.calls[0]![0]).toEqual({ kind: 'doc', path: 'reports/r1' });
    expect(result.current.loading).toBe(true);

    act(() => listeners[0]!.next(docSnap(null)));
    expect(result.current).toEqual({ data: null, loading: false, error: null });
    act(() => listeners[0]!.next(docSnap({ id: 'r1', campaignName: 'A' })));
    expect(result.current.data).toMatchObject({ id: 'r1', campaignName: 'A' });
  });

  test('useStore reads stores/{id}', () => {
    const { result } = renderHook(() => useStore('850'));
    expect(fs.onSnapshot.mock.calls[0]![0]).toEqual({ kind: 'doc', path: 'stores/850' });
    act(() => listeners[0]!.next(docSnap({ id: '850', name: 'Palladium Praha' })));
    expect(result.current.data).toMatchObject({ id: '850', name: 'Palladium Praha' });
  });
});

describe('zone hooks', () => {
  test('useZones lists the zones of a report ordered by order', () => {
    const { result } = renderHook(() => useZones('r1'));
    expect(lastQuery()).toEqual({ kind: 'collection', path: 'reports/r1/zones', constraints: [{ orderBy: ['order', 'asc'] }] });
    act(() => listeners[0]!.next(querySnap([{ id: 'women-image', order: 0 }])));
    expect(result.current.data).toMatchObject([{ id: 'women-image', order: 0 }]);
  });

  test('useZone reads one zone', () => {
    const { result } = renderHook(() => useZone('r1', 'women-image'));
    expect(fs.onSnapshot.mock.calls[0]![0]).toEqual({ kind: 'doc', path: 'reports/r1/zones/women-image' });
    act(() => listeners[0]!.next(docSnap({ id: 'women-image', state: 'empty' })));
    expect(result.current.data).toMatchObject({ id: 'women-image' });
  });

  test('useFeedback lists the feedback of a zone, oldest first', () => {
    const { result } = renderHook(() => useFeedback('r1', 'women-image'));
    expect(lastQuery()).toEqual({
      kind: 'collection', path: 'reports/r1/zones/women-image/feedback', constraints: [{ orderBy: ['createdAt', 'asc'] }],
    });
    act(() => listeners[0]!.next(querySnap([{ id: 'f1', comment: 'Fix' }])));
    expect(result.current.data).toMatchObject([{ id: 'f1', comment: 'Fix' }]);
  });
});

describe('usePhotoUrl', () => {
  test('is null until the download URL arrives, then the URL', async () => {
    st.getDownloadURL.mockResolvedValue('https://files/one');
    const { result } = renderHook(() => usePhotoUrl('reports/CZ/850/r1/z/one.jpg'));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('https://files/one'));
    expect(st.ref).toHaveBeenCalledWith({ name: 'storage' }, 'reports/CZ/850/r1/z/one.jpg');
  });

  test('caches by path: the same photo is fetched once and shows at once the second time', async () => {
    st.getDownloadURL.mockResolvedValue('https://files/two');
    const path = 'reports/CZ/850/r1/z/two.jpg';
    const first = renderHook(() => usePhotoUrl(path));
    await waitFor(() => expect(first.result.current).toBe('https://files/two'));

    const second = renderHook(() => usePhotoUrl(path));
    expect(second.result.current).toBe('https://files/two');
    expect(st.getDownloadURL).toHaveBeenCalledTimes(1);
  });

  test('two components asking at the same time share one request', async () => {
    st.getDownloadURL.mockResolvedValue('https://files/three');
    const path = 'reports/CZ/850/r1/z/three.jpg';
    const a = renderHook(() => usePhotoUrl(path));
    const b = renderHook(() => usePhotoUrl(path));
    await waitFor(() => expect(a.result.current).toBe('https://files/three'));
    await waitFor(() => expect(b.result.current).toBe('https://files/three'));
    expect(st.getDownloadURL).toHaveBeenCalledTimes(1);
  });

  test('a failed lookup stays null and is tried again next time', async () => {
    st.getDownloadURL.mockRejectedValueOnce(new Error('storage/object-not-found')).mockResolvedValueOnce('https://files/four');
    const path = 'reports/CZ/850/r1/z/four.jpg';
    const first = renderHook(() => usePhotoUrl(path));
    await act(async () => { await Promise.resolve(); });
    expect(first.result.current).toBeNull();

    const second = renderHook(() => usePhotoUrl(path));
    await waitFor(() => expect(second.result.current).toBe('https://files/four'));
  });

  test('switches to the new path without showing the old URL', async () => {
    st.getDownloadURL.mockImplementation(async (r: { fullPath: string }) => `https://files/${r.fullPath}`);
    const { result, rerender } = renderHook(({ path }) => usePhotoUrl(path), { initialProps: { path: 'p/five.jpg' } });
    await waitFor(() => expect(result.current).toBe('https://files/p/five.jpg'));
    rerender({ path: 'p/six.jpg' });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('https://files/p/six.jpg'));
  });
});
