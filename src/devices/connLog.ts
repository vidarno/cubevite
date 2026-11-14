import { useSyncExternalStore } from 'react';

/** In-app connection log, so Bluetooth problems can be diagnosed without devtools. */
let lines: string[] = [];
const listeners = new Set<() => void>();

export function log(msg: string) {
  const t = new Date().toISOString().slice(11, 23);
  lines = [...lines, `${t}  ${msg}`].slice(-200);
  console.info('[cubevite]', msg);
  listeners.forEach((l) => l());
}
export function clearLog() {
  lines = [];
  listeners.forEach((l) => l());
}
export function useConnLog() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => lines,
  );
}

export const hex = (dv: DataView) =>
  Array.from(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
