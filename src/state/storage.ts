import { useCallback, useSyncExternalStore } from 'react';

/** Tiny persisted store on localStorage. Swappable for Capacitor Preferences / SQLite on iOS later. */
export function createPersisted<T>(key: string, initial: T) {
  let value: T = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw) value = JSON.parse(raw) as T;
  } catch { /* ignore */ }
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T | ((prev: T) => T)) {
      value = typeof next === 'function' ? (next as (p: T) => T)(value) : next;
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => { listeners.delete(l); };
    },
  };
}

export type Persisted<T> = ReturnType<typeof createPersisted<T>>;

export function usePersisted<T>(p: Persisted<T>): [T, Persisted<T>['set']] {
  const v = useSyncExternalStore(p.subscribe, p.get);
  return [v, useCallback(p.set, [p])];
}
