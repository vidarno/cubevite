import { describe, expect, it, vi } from 'vitest';
import { firstAdvertising, isCubeName, macFromManufacturerData } from './scan';

/** Fake device: advertises after `afterMs` (never if null); records whether its watch was aborted. */
function fakeDevice(name: string, afterMs: number | null, data?: number[]) {
  const target = new EventTarget();
  const dev = {
    name, id: name, aborted: false, watching: false,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    watchAdvertisements(opts?: { signal?: AbortSignal }) {
      dev.watching = true;
      opts?.signal?.addEventListener('abort', () => { dev.aborted = true; });
      if (afterMs !== null) {
        setTimeout(() => {
          const e = new Event('advertisementreceived') as Event & { manufacturerData: Map<number, DataView>; rssi: number };
          e.manufacturerData = new Map(data ? [[0x0001, new DataView(new Uint8Array(data).buffer)]] : []);
          e.rssi = -50;
          target.dispatchEvent(e);
        }, afterMs);
      }
      return Promise.resolve();
    },
  };
  return dev;
}

describe('macFromManufacturerData', () => {
  it('reads the last 6 of the first 9 bytes, reversed', () => {
    const dv = new DataView(new Uint8Array([0xaa, 0xbb, 0xcc, 0x56, 0x34, 0x12, 0xef, 0xcd, 0xab, 0x99]).buffer);
    expect(macFromManufacturerData(dv)).toBe('AB:CD:EF:12:34:56');
  });
  it('returns null for short data', () => {
    expect(macFromManufacturerData(new DataView(new Uint8Array([1, 2, 3]).buffer))).toBeNull();
  });
});

describe('isCubeName', () => {
  it('matches the GAN chooser prefixes only', () => {
    expect(['GANi4-1234', 'gan356', 'MG3-ab', 'AiCube'].every(isCubeName)).toBe(true);
    expect([undefined, 'Magic Mouse', 'AirPods'].some(isCubeName)).toBe(false);
  });
});

describe('firstAdvertising', () => {
  it('resolves with the first device heard and stops every watch', async () => {
    vi.useFakeTimers();
    const slow = fakeDevice('GAN slow', 300);
    const fast = fakeDevice('GAN fast', 100, [0, 0, 0, 6, 5, 4, 3, 2, 1]);
    const off = fakeDevice('GAN off', null);
    const p = firstAdvertising([slow, fast, off] as never, 5000);
    await vi.advanceTimersByTimeAsync(150);
    const s = await p;
    expect(s?.device.name).toBe('GAN fast');
    expect(s?.mac).toBe('01:02:03:04:05:06');
    expect([slow, fast, off].every((d) => d.watching && d.aborted)).toBe(true);
    vi.useRealTimers();
  });

  it('resolves null after the timeout when nothing advertises', async () => {
    vi.useFakeTimers();
    const p = firstAdvertising([fakeDevice('GAN off', null)] as never, 2000);
    await vi.advanceTimersByTimeAsync(2001);
    expect(await p).toBeNull();
    vi.useRealTimers();
  });

  it('resolves null at once when devices cannot be watched', async () => {
    expect(await firstAdvertising([{ name: 'GAN', id: 'x' }] as never, 2000)).toBeNull();
  });
});
