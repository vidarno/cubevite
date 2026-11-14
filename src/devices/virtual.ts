import { applyMove, SOLVED } from '../cube/facelets';
import { faceMapFor, mapMove } from '../cube/display';
import { settingsStore } from '../state/data';
import { Emitter, type CubeDevice } from './types';

/**
 * Keyboard-driven virtual cube (csTimer-style key map) so the whole app can be
 * developed and tested without a physical smart cube.
 */
export const VIRTUAL_KEYMAP: Record<string, string> = {
  j: 'U', f: "U'", i: 'R', k: "R'", d: 'L', e: "L'", h: 'F', g: "F'",
  s: 'D', l: "D'", w: 'B', o: "B'",
};

export class VirtualCube implements CubeDevice {
  readonly kind = 'virtual' as const;
  readonly name = 'Virtual cube (keyboard)';
  private emitter = new Emitter();
  private state = SOLVED;

  constructor() {
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const move = VIRTUAL_KEYMAP[e.key.toLowerCase()];
    if (!move) return;
    e.preventDefault();
    // Keys are pressed in the frame shown on screen; z2 is its own inverse, so the same map converts back.
    const yellowTop = settingsStore.get().yellowTop ?? true;
    this.turn(mapMove(move, faceMapFor(yellowTop ? 'z2' : '')));
  };

  turn(move: string) {
    this.state = applyMove(this.state, move);
    this.emitter.emit({ type: 'move', move, localTimestamp: performance.now(), cubeTimestamp: null });
  }

  subscribe = (l: Parameters<CubeDevice['subscribe']>[0]) => {
    const unsub = this.emitter.subscribe(l);
    queueMicrotask(() => l({ type: 'facelets', facelets: this.state }));
    return unsub;
  };
  requestFacelets = async () => this.emitter.emit({ type: 'facelets', facelets: this.state });
  requestBattery = async () => this.emitter.emit({ type: 'battery', level: 100 });
  markSolved = async () => {
    this.state = SOLVED;
    this.emitter.emit({ type: 'facelets', facelets: this.state });
  };
  disconnect = async () => {
    window.removeEventListener('keydown', this.onKey);
    this.emitter.emit({ type: 'disconnect' });
  };
}
