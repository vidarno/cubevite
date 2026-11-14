import { useSyncExternalStore } from 'react';
import type { CaseDiagram } from '../cube/drills';

/** The alg being looped (open loop panel), or null. Not persisted. */
export interface LoopTarget {
  /** Case id (stats key), e.g. "PLL T". */
  id: string;
  title: string;
  /** Main alg first, then alternatives (display frame, yellow top). */
  algs: string[];
  diagram?: CaseDiagram;
}

let current: LoopTarget | null = null;
const listeners = new Set<() => void>();

export const loopStore = {
  get: () => current,
  set(t: LoopTarget | null) { current = t; listeners.forEach((l) => l()); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export const openLoop = (t: LoopTarget) => loopStore.set(t);
export const useLoop = () => useSyncExternalStore(loopStore.subscribe, loopStore.get);
