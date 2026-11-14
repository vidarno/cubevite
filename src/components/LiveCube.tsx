import { useEffect, useRef } from 'react';
import { TwistyPlayer } from 'cubing/twisty';
import { isSolved } from '../cube/facelets';
import { faceMapFor, mapMove } from '../cube/display';
import { setupAlgFor } from '../cube/solver';
import { cubeStore, useCube } from '../state/cubeStore';
import { settingsStore } from '../state/data';
import { usePersisted } from '../state/storage';

/** Live 3D view mirroring the physical smart cube. */
export function LiveCube({ size = 320 }: { size?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const cube = useCube();
  const [settings] = usePersisted(settingsStore);
  const yellowTop = settings.yellowTop ?? true;
  const syncRef = useRef<(state: string) => void>(() => {});

  useEffect(() => {
    const player = new TwistyPlayer({
      puzzle: '3x3x3',
      controlPanel: 'none',
      background: 'none',
      hintFacelets: 'floating',
      tempoScale: 5,
      experimentalDragInput: 'auto',
      cameraLatitude: 30,
      cameraLongitude: -30,
    });
    player.style.width = '100%';
    player.style.height = '100%';
    host.current!.appendChild(player);

    let syncing = false;
    let pending: string[] = [];
    let movesSinceSync = 0;
    let generation = 0;

    const sync = async (state: string) => {
      const gen = ++generation;
      syncing = true;
      pending = [];
      // Rotating the whole player (z2) keeps TwistyPlayer's colours right: yellow ends up on top.
      const setup = `${isSolved(state) ? '' : await setupAlgFor(state)} ${yellowTop ? 'z2' : ''}`.trim();
      if (gen !== generation) return;
      player.experimentalSetupAlg = setup;
      player.alg = '';
      syncing = false;
      movesSinceSync = 0;
      for (const m of pending) player.experimentalAddMove(m);
      movesSinceSync = pending.length;
      pending = [];
    };
    syncRef.current = sync;
    sync(cubeStore.get().state);

    const frame = faceMapFor(yellowTop ? 'z2' : '');
    const unsub = cubeStore.onMove((ev) => {
      const m = mapMove(ev.move, frame);
      if (syncing) { pending.push(m); return; }
      player.experimentalAddMove(m);
      movesSinceSync++;
      // Keep the player's internal alg short: re-anchor when solved or after many moves.
      if (isSolved(ev.state) || movesSinceSync > 60) {
        window.setTimeout(() => sync(cubeStore.get().state), 400);
      }
    });

    return () => {
      unsub();
      generation++;
      player.remove();
    };
  }, [yellowTop]);

  // Full-state resync (connect, cube reset, facelets refresh).
  useEffect(() => {
    if (cube.resyncVersion > 0) syncRef.current(cube.state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cube.resyncVersion]);

  return <div className="live-cube" style={{ width: size, height: size }} ref={host} />;
}
