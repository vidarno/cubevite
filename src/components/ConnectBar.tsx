import { useState } from 'react';
import { connectGan, diagnoseDevice, webBluetoothAvailable } from '../devices/gan';
import { log, useConnLog } from '../devices/connLog';
import { VirtualCube } from '../devices/virtual';
import { cubeStore, useCube } from '../state/cubeStore';

type MacRequest = { deviceName: string; remembered: string | null; resolve: (mac: string | null) => void };

const MAC_RE = /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/i;

export function ConnectBar() {
  const cube = useCube();
  const [macReq, setMacReq] = useState<MacRequest | null>(null);
  const [macInput, setMacInput] = useState('');
  const [showLog, setShowLog] = useState(false);
  const logLines = useConnLog();

  const askMac = (deviceName: string, remembered: string | null) =>
    new Promise<string | null>((resolve) => {
      setMacInput(remembered ?? '');
      setMacReq({ deviceName, remembered, resolve });
    });

  const finishMac = (mac: string | null) => {
    macReq?.resolve(mac);
    setMacReq(null);
  };

  const connected = cube.status === 'connected';

  return (
    <div className="connect-bar">
      {connected ? (
        <>
          <span className="dot ok" />
          <span className="device-name">{cube.device?.name}</span>
          {cube.battery !== null && <span className="battery" title="Battery">🔋 {cube.battery}%</span>}
          <button className="ghost" onClick={() => cubeStore.markSolved()} title="Tell the app (and cube) that the physical cube is currently solved">
            Mark solved
          </button>
          <button className="ghost" onClick={() => cubeStore.disconnect()}>Disconnect</button>
        </>
      ) : (
        <>
          <span className={`dot ${cube.status === 'connecting' ? 'busy' : ''}`} />
          <span className="split">
            <button
              className="primary"
              disabled={cube.status === 'connecting' || !webBluetoothAvailable()}
              title={webBluetoothAvailable()
                ? 'Connects to the first cube you have connected before that is switched on (no list). The first time, the list opens.'
                : 'Web Bluetooth is not available in this browser - use Chrome or Edge'}
              onClick={() => cubeStore.connect(() => connectGan(askMac, 'quick'))}
            >
              {cube.status === 'connecting' ? 'Connecting…' : 'Connect GAN cube'}
            </button>
            <button
              className="primary"
              disabled={cube.status === 'connecting' || !webBluetoothAvailable()}
              title="Pick a cube from the list of nearby cubes (for a new cube, or several cubes around)"
              onClick={() => cubeStore.connect(() => connectGan(askMac, 'choose'))}
            >
              Choose…
            </button>
          </span>
          <button className="ghost" onClick={() => cubeStore.connect(async () => new VirtualCube())}>
            Virtual cube
          </button>
        </>
      )}
      <button className="ghost small" onClick={() => setShowLog((v) => !v)} title="Bluetooth connection log">
        Log{logLines.length ? ` (${logLines.length})` : ''}
      </button>
      {cube.error && <span className="error">{cube.error}</span>}

      {showLog && (
        <div className="modal-backdrop" onClick={() => setShowLog(false)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <h3>Connection log</h3>
            <p className="muted small">
              Shows each step of the last connection attempt. "Diagnose" connects to any Bluetooth device and lists
              the services it exposes, which is useful if the cube isn't recognised.
            </p>
            <pre className="conn-log">{logLines.join('\n') || 'Nothing logged yet - try connecting.'}</pre>
            <div className="row">
              <button className="ghost" disabled={!webBluetoothAvailable()} onClick={() => diagnoseDevice().catch((e) => log(`Diagnose failed: ${e?.message ?? e}`))}>
                Diagnose (any device)
              </button>
              <button className="ghost" onClick={() => navigator.clipboard.writeText(logLines.join('\n'))}>Copy log</button>
              <span className="spacer" />
              <button className="ghost" onClick={() => setShowLog(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {macReq && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => { e.preventDefault(); if (MAC_RE.test(macInput.trim())) finishMac(macInput.trim().toUpperCase()); }}
          >
            <h3>Cube MAC address needed</h3>
            <p>
              GAN cubes encrypt their Bluetooth data with a key derived from the cube's MAC address, and
              your browser didn't expose it automatically for <b>{macReq.deviceName}</b>.
            </p>
            <p className="muted">
              Easiest fix: open <code>chrome://flags/#enable-experimental-web-platform-features</code>, enable it and
              restart Chrome - the MAC is then read automatically. Otherwise enter it below (it's shown in the cube's
              device info in GAN's CubeStation app, or in csTimer's connection log). It is remembered for next time.
            </p>
            <input
              autoFocus
              placeholder="AB:12:CD:34:EF:56"
              value={macInput}
              onChange={(e) => setMacInput(e.target.value)}
              className={macInput && !MAC_RE.test(macInput.trim()) ? 'invalid' : ''}
            />
            <div className="row">
              <button type="button" className="ghost" onClick={() => finishMac(null)}>Cancel</button>
              <button type="submit" className="primary" disabled={!MAC_RE.test(macInput.trim())}>Connect</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
