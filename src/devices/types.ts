/**
 * Platform-neutral smart cube interface. The web build uses Web Bluetooth (gan.ts);
 * a future iOS build can provide the same interface on top of a native BLE plugin.
 */

export type CubeEvent =
  | { type: 'move'; move: string; localTimestamp: number; cubeTimestamp: number | null }
  | { type: 'facelets'; facelets: string }
  | { type: 'battery'; level: number }
  | { type: 'hardware'; name?: string; firmware?: string; gyroSupported?: boolean }
  | { type: 'gyro'; quaternion: { x: number; y: number; z: number; w: number } }
  | { type: 'disconnect' };

export type CubeListener = (e: CubeEvent) => void;

export interface CubeDevice {
  readonly kind: 'gan' | 'virtual';
  readonly name: string;
  subscribe(listener: CubeListener): () => void;
  requestFacelets(): Promise<void>;
  requestBattery(): Promise<void>;
  /** Tell the cube its current physical state is solved (re-sync after drift). */
  markSolved(): Promise<void>;
  disconnect(): Promise<void>;
}

export class Emitter {
  private listeners = new Set<CubeListener>();
  subscribe(l: CubeListener) {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }
  emit(e: CubeEvent) {
    this.listeners.forEach((l) => l(e));
  }
}
