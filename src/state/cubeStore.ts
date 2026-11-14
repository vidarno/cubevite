import { useSyncExternalStore } from 'react';
import { applyMove, SOLVED } from '../cube/facelets';
import type { CubeDevice, CubeEvent } from '../devices/types';

export interface MoveEvent {
  move: string;
  localTimestamp: number;
  cubeTimestamp: number | null;
  /** state after the move */
  state: string;
  /** state before the move */
  prev: string;
}

export type ResyncEvent = { state: string };

export interface CubeSnapshot {
  device: CubeDevice | null;
  status: 'disconnected' | 'connecting' | 'connected';
  error: string | null;
  state: string;
  battery: number | null;
  hardware: string | null;
  /** increments on every state change; handy as a React key */
  version: number;
  /** set when the state was replaced wholesale (connect / resync) rather than by a move */
  resyncVersion: number;
  lastMove: string | null;
}

type MoveListener = (m: MoveEvent) => void;

class CubeStore {
  private snap: CubeSnapshot = {
    device: null, status: 'disconnected', error: null, state: SOLVED, battery: null,
    hardware: null, version: 0, resyncVersion: 0, lastMove: null,
  };
  private listeners = new Set<() => void>();
  private moveListeners = new Set<MoveListener>();
  private unsubDevice: (() => void) | null = null;
  private batteryTimer: number | null = null;

  get = () => this.snap;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  };
  onMove(l: MoveListener): () => void {
    this.moveListeners.add(l);
    return () => { this.moveListeners.delete(l); };
  }

  private set(patch: Partial<CubeSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  async connect(factory: () => Promise<CubeDevice>) {
    await this.disconnect();
    this.set({ status: 'connecting', error: null });
    try {
      const device = await factory();
      this.unsubDevice = device.subscribe(this.handle);
      this.set({ device, status: 'connected' });
      await device.requestFacelets().catch(() => {});
      await device.requestBattery().catch(() => {});
      this.batteryTimer = window.setInterval(() => device.requestBattery().catch(() => {}), 60_000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const cancelled = /cancel|chosen/i.test(msg);
      this.set({ status: 'disconnected', error: cancelled ? null : msg, device: null });
    }
  }

  async disconnect() {
    const d = this.snap.device;
    this.cleanup();
    if (d) await d.disconnect().catch(() => {});
    this.set({ device: null, status: 'disconnected', battery: null, hardware: null });
  }

  private cleanup() {
    this.unsubDevice?.();
    this.unsubDevice = null;
    if (this.batteryTimer) clearInterval(this.batteryTimer);
    this.batteryTimer = null;
  }

  private handle = (e: CubeEvent) => {
    switch (e.type) {
      case 'move': {
        const prev = this.snap.state;
        const state = applyMove(prev, e.move);
        this.set({ state, version: this.snap.version + 1, lastMove: e.move });
        const ev: MoveEvent = { ...e, state, prev };
        this.moveListeners.forEach((l) => l(ev));
        break;
      }
      case 'facelets':
        if (e.facelets !== this.snap.state || this.snap.resyncVersion === 0) {
          this.set({ state: e.facelets, version: this.snap.version + 1, resyncVersion: this.snap.resyncVersion + 1 });
        }
        break;
      case 'battery':
        this.set({ battery: e.level });
        break;
      case 'hardware':
        this.set({ hardware: [e.name, e.firmware].filter(Boolean).join(' ') || null });
        break;
      case 'disconnect':
        this.cleanup();
        this.set({ device: null, status: 'disconnected', battery: null });
        break;
    }
  };

  /** Declare the physical cube solved (fixes drift between cube and app). */
  async markSolved() {
    if (this.snap.device) await this.snap.device.markSolved();
    else this.set({ state: SOLVED, version: this.snap.version + 1, resyncVersion: this.snap.resyncVersion + 1 });
  }
}

export const cubeStore = new CubeStore();

export function useCube(): CubeSnapshot {
  return useSyncExternalStore(cubeStore.subscribe, cubeStore.get);
}
