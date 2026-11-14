/**
 * Finding an already-granted cube without Chrome's device chooser.
 *
 * `navigator.bluetooth.requestDevice()` always shows the chooser. Devices the site was granted
 * before are returned by `getDevices()` (no chooser, no user gesture), and `watchAdvertisements()`
 * tells us which of them is switched on and in range - and its advertisement carries the MAC we
 * need for decryption anyway.
 */

/** Name prefixes gan-web-bluetooth's chooser filters on. */
export const isCubeName = (name: string | undefined) => /^(gan|mg|aicube)/i.test(name ?? '');

/** GAN manufacturer data ends with the MAC in reverse byte order (within the first 9 bytes). */
export function macFromManufacturerData(dv: DataView): string | null {
  const bytes = new Uint8Array(dv.buffer, dv.byteOffset, Math.min(dv.byteLength, 9));
  if (bytes.length < 6) return null;
  return Array.from(bytes.slice(bytes.length - 6)).reverse()
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(':');
}

export interface Sighting { device: BluetoothDevice; mac: string | null; rssi: number | null }

/** Minimal shape we need, so tests can pass fakes. */
type Watchable = Pick<BluetoothDevice, 'watchAdvertisements' | 'addEventListener' | 'removeEventListener' | 'name' | 'id'>;

/**
 * Watch advertisements of all `devices` at once and resolve with the first one heard
 * (null after `timeoutMs`). All watches are stopped before resolving.
 */
export function firstAdvertising(
  devices: Watchable[], timeoutMs: number, log: (msg: string) => void = () => {},
): Promise<Sighting | null> {
  const watchable = devices.filter((d) => typeof d.watchAdvertisements === 'function');
  if (!watchable.length) return Promise.resolve(null);
  return new Promise((resolve) => {
    const ac = new AbortController();
    let done = false;
    let failed = 0;
    const handlers = new Map<Watchable, EventListener>();
    const finish = (s: Sighting | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      handlers.forEach((h, d) => d.removeEventListener('advertisementreceived', h));
      ac.abort();
      resolve(s);
    };
    for (const d of watchable) {
      const h = (evt: Event) => {
        const e = evt as BluetoothAdvertisingEvent;
        let mac: string | null = null;
        for (const [, dv] of e.manufacturerData?.entries() ?? []) {
          mac = macFromManufacturerData(dv);
          if (mac) break;
        }
        log(`Advertisement from "${d.name}": rssi=${e.rssi ?? '?'}${mac ? `, MAC ${mac}` : ', no MAC in manufacturer data'}`);
        finish({ device: d as BluetoothDevice, mac, rssi: e.rssi ?? null });
      };
      handlers.set(d, h);
      d.addEventListener('advertisementreceived', h);
      d.watchAdvertisements({ signal: ac.signal }).catch((err: unknown) => {
        if (done) return;
        log(`watchAdvertisements() failed for "${d.name}": ${(err as Error)?.message ?? err}`);
        if (++failed === watchable.length) finish(null);
      });
    }
    const timer = setTimeout(() => {
      log(`No known cube advertised within ${timeoutMs / 1000}s.`);
      finish(null);
    }, timeoutMs);
  });
}
