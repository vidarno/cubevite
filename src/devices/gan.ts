import { connectGanCube, type GanCubeConnection, type GanCubeEvent } from 'gan-web-bluetooth';
import { Emitter, type CubeDevice } from './types';
import { clearLog, hex, log } from './connLog';
import { firstAdvertising, isCubeName, macFromManufacturerData } from './scan';

export const webBluetoothAvailable = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;

const MAC_KEY = (name: string) => `cubevite.mac.${name}`;

/**
 * GAN cubes encrypt their traffic with a key salted by the cube's MAC address.
 * Chrome can read it from advertisements only with the "Experimental Web Platform features"
 * flag; otherwise we ask the user once and remember it per device name.
 */
export type MacPrompt = (deviceName: string, remembered: string | null) => Promise<string | null>;

/** All service UUIDs we want access to (GAN gen1-4 + standard info services), for diagnostics. */
const DIAG_SERVICES = [
  '6e400001-b5a3-f393-e0a9-e50e24dc4179', // GAN gen2
  '8653000a-43e6-47b7-9cb0-5fc21d4ae340', // GAN gen3
  '00000010-0000-fff7-fff6-fff5fff4fff0', // GAN gen4
  '0000fff0-0000-1000-8000-00805f9b34fb', // GAN gen1 / generic
  '0000180a-0000-1000-8000-00805f9b34fb', // device information
  '0000180f-0000-1000-8000-00805f9b34fb', // battery
  '0000fe95-0000-1000-8000-00805f9b34fb',
  '0000aadb-0000-1000-8000-00805f9b34fb',
];
const CIC_LIST = Array.from({ length: 256 }, (_, i) => (i << 8) | 0x01);

/** Watch advertisements and pull the MAC out of GAN manufacturer data, logging everything. */
async function readMacFromAdvertisements(device: BluetoothDevice, timeoutMs = 8000): Promise<string | null> {
  if (typeof device.watchAdvertisements !== 'function') {
    log('watchAdvertisements() is not available: the Experimental Web Platform features flag is not active in this browser.');
    return null;
  }
  return new Promise((resolve) => {
    const ac = new AbortController();
    let done = false;
    const finish = (mac: string | null) => {
      if (done) return;
      done = true;
      device.removeEventListener('advertisementreceived', onAdv);
      ac.abort();
      resolve(mac);
    };
    const onAdv = (evt: Event) => {
      const e = evt as BluetoothAdvertisingEvent;
      const entries = [...e.manufacturerData.entries()];
      log(`Advertisement: name=${e.name ?? '?'} rssi=${e.rssi ?? '?'} manufacturerData=${entries.length ? entries.map(([k, v]) => `0x${k.toString(16).padStart(4, '0')}: [${hex(v)}]`).join(', ') : 'none'}`);
      for (const [, dv] of entries) {
        const mac = macFromManufacturerData(dv);
        if (mac) {
          log(`MAC from advertisement: ${mac}`);
          finish(mac);
          return;
        }
      }
    };
    device.addEventListener('advertisementreceived', onAdv);
    log('Listening for advertisements to read the MAC…');
    device.watchAdvertisements({ signal: ac.signal }).catch((err) => {
      log(`watchAdvertisements() failed: ${err?.message ?? err}`);
      finish(null);
    });
    setTimeout(() => {
      if (!done) log(`No advertisement received within ${timeoutMs / 1000}s.`);
      finish(null);
    }, timeoutMs);
  });
}

/**
 * 'quick': connect to the first previously granted cube that is switched on and in range, without
 * Chrome's chooser (falls back to the chooser when no cube was granted before or the browser can't
 * list granted devices). 'choose': always show the chooser.
 */
export type ConnectMode = 'quick' | 'choose';

const QUICK_SCAN_MS = 6000;

/** Cubes this site was granted before. Needs getDevices() (Chrome's new Web Bluetooth permissions backend). */
async function grantedCubes(): Promise<BluetoothDevice[]> {
  if (typeof navigator.bluetooth.getDevices !== 'function') {
    log('getDevices() is not available: enable chrome://flags/#enable-web-bluetooth-new-permissions-backend ("Use the new permissions backend for Web Bluetooth") and restart Chrome. Showing the chooser.');
    return [];
  }
  const all = await navigator.bluetooth.getDevices();
  const cubes = all.filter((d) => isCubeName(d.name));
  log(`Previously granted devices: ${all.length ? all.map((d) => `"${d.name ?? '?'}"`).join(', ') : 'none'}; cubes: ${cubes.length}`);
  if (!cubes.length) log('No previously granted cube: showing the chooser. If you picked one before and still see this after a reload, Chrome is not keeping Bluetooth permissions: enable chrome://flags/#enable-web-bluetooth-new-permissions-backend and restart Chrome.');
  return cubes;
}

/**
 * gan-web-bluetooth always calls requestDevice() itself; to connect to a device we already have
 * we answer that call with it (shadowing the prototype method for the duration of the connect).
 */
async function withDevice<T>(device: BluetoothDevice, fn: () => Promise<T>): Promise<T> {
  const bt = navigator.bluetooth as Bluetooth & { requestDevice: Bluetooth['requestDevice'] };
  bt.requestDevice = async () => device;
  try {
    return await fn();
  } finally {
    delete (bt as Partial<Bluetooth>).requestDevice;
  }
}

export async function connectGan(askMac: MacPrompt, mode: ConnectMode = 'choose'): Promise<CubeDevice> {
  clearLog();
  log(`User agent: ${navigator.userAgent}`);
  log(`Mode: ${mode === 'quick' ? 'quick connect (first known cube in range)' : 'choose from list'}`);
  try {
    const avail = await navigator.bluetooth.getAvailability?.();
    log(`Bluetooth adapter available: ${avail}`);
  } catch { /* ignore */ }

  if (mode === 'quick') {
    const known = await grantedCubes();
    if (known.length) {
      if (known.every((d) => typeof d.watchAdvertisements !== 'function')) {
        log('watchAdvertisements() is not available, so known cubes can\'t be found without the chooser.');
      } else {
        log(`Looking for ${known.map((d) => `"${d.name}"`).join(', ')} (up to ${QUICK_SCAN_MS / 1000}s)…`);
        const seen = await firstAdvertising(known, QUICK_SCAN_MS, log);
        if (!seen) {
          log('Nothing found: wake the cube, or use "Choose…" for the chooser.');
          throw new Error('No known cube nearby. Turn a face to wake it, or use "Choose…" to pick a cube.');
        }
        log(`Found "${seen.device.name}" (id ${seen.device.id})`);
        return withDevice(seen.device, () => connectViaLibrary(askMac, seen.mac));
      }
    }
  }
  return connectViaLibrary(askMac, null);
}

async function connectViaLibrary(askMac: MacPrompt, knownMac: string | null): Promise<CubeDevice> {
  let asked = false;
  try {
    const conn: GanCubeConnection = await connectGanCube(async (device, isFallback) => {
      const name = device.name ?? 'GAN';
      if (!isFallback) log(`Selected device: "${device.name}" (id ${device.id})`);
      if (!isFallback && knownMac) return knownMac;
      if (isFallback && asked) return null;
      const auto = isFallback ? null : await readMacFromAdvertisements(device);
      if (auto) return auto;
      asked = true;
      const remembered = localStorage.getItem(MAC_KEY(name));
      const mac = await askMac(name, remembered);
      log(mac ? `Using manually entered MAC ${mac}` : 'MAC entry cancelled');
      if (mac) localStorage.setItem(MAC_KEY(name), mac);
      return mac;
    });
    log(`GATT connected, protocol driver selected. Device ${conn.deviceName}, MAC ${conn.deviceMAC}`);
    return new GanDevice(conn);
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    log(`Connection failed: ${msg}`);
    if (/target BLE services/.test(msg)) {
      log('The cube connected but exposes none of the known GAN services: run "Diagnose (any device)" to list what it does expose.');
    }
    throw e;
  }
}

/** Connect to any BLE device and list its services/characteristics. For figuring out unknown cubes. */
export async function diagnoseDevice(): Promise<void> {
  clearLog();
  log(`User agent: ${navigator.userAgent}`);
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: DIAG_SERVICES,
    optionalManufacturerData: CIC_LIST,
  });
  log(`Selected device: "${device.name}" (id ${device.id})`);
  await readMacFromAdvertisements(device, 6000);
  log('Connecting to GATT…');
  const gatt = await device.gatt!.connect();
  try {
    const services = await gatt.getPrimaryServices();
    log(`Accessible services (${services.length}):`);
    for (const s of services) {
      let chars = '';
      try {
        const cs = await s.getCharacteristics();
        chars = cs.map((c) => `${c.uuid} [${Object.entries(c.properties).filter(([, v]) => v === true).map(([k]) => k).join(',')}]`).join('; ');
      } catch (err) { chars = `(characteristics error: ${(err as Error).message})`; }
      log(`  service ${s.uuid}: ${chars}`);
    }
  } catch (err) {
    log(`getPrimaryServices failed: ${(err as Error).message}`);
  } finally {
    gatt.disconnect();
    log('Disconnected. Copy this log and share it.');
  }
}

class GanDevice implements CubeDevice {
  readonly kind = 'gan' as const;
  readonly name: string;
  private emitter = new Emitter();
  private conn: GanCubeConnection;

  constructor(conn: GanCubeConnection) {
    this.conn = conn;
    this.name = conn.deviceName;
    localStorage.setItem(MAC_KEY(conn.deviceName), conn.deviceMAC);
    conn.events$.subscribe((e: GanCubeEvent) => this.handle(e));
    setTimeout(() => {
      if (this.eventCount === 0) log('No valid events received 5s after connecting. If the cube is connected but silent, the MAC is probably wrong (it is used as the decryption key).');
    }, 5000);
  }

  private eventCount = 0;
  private logged: Record<string, number> = {};

  private handle(e: GanCubeEvent) {
    this.eventCount++;
    this.logged[e.type] = (this.logged[e.type] ?? 0) + 1;
    if (this.logged[e.type] <= 3) {
      const { type, ...rest } = e as unknown as Record<string, unknown>;
      log(`Event ${type}: ${JSON.stringify(rest).slice(0, 200)}`);
    }
    switch (e.type) {
      case 'MOVE':
        this.emitter.emit({
          type: 'move', move: e.move.trim(),
          localTimestamp: e.localTimestamp ?? performance.now(), cubeTimestamp: e.cubeTimestamp,
        });
        break;
      case 'FACELETS':
        this.emitter.emit({ type: 'facelets', facelets: e.facelets });
        break;
      case 'BATTERY':
        this.emitter.emit({ type: 'battery', level: e.batteryLevel });
        break;
      case 'HARDWARE':
        this.emitter.emit({ type: 'hardware', name: e.hardwareName, firmware: e.softwareVersion, gyroSupported: e.gyroSupported });
        break;
      case 'GYRO':
        this.emitter.emit({ type: 'gyro', quaternion: e.quaternion });
        break;
      case 'DISCONNECT':
        this.emitter.emit({ type: 'disconnect' });
        break;
    }
  }

  subscribe = (l: Parameters<CubeDevice['subscribe']>[0]) => this.emitter.subscribe(l);
  requestFacelets = () => this.conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
  requestBattery = () => this.conn.sendCubeCommand({ type: 'REQUEST_BATTERY' });
  markSolved = async () => {
    await this.conn.sendCubeCommand({ type: 'REQUEST_RESET' });
    await this.conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
  };
  disconnect = () => this.conn.disconnect();
}
