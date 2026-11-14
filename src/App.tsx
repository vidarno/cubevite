import { useEffect, useState } from 'react';
import { ConnectBar } from './components/ConnectBar';
import { TimerPage } from './pages/TimerPage';
import { TrainerPage } from './pages/TrainerPage';
import { AlgsPage } from './pages/AlgsPage';
import { InsightsPage } from './pages/InsightsPage';
import { VIRTUAL_KEYMAP } from './devices/virtual';
import { useCube } from './state/cubeStore';
import { useLoop } from './state/loop';
import { AlgLoop } from './components/AlgLoop';

type Tab = 'timer' | 'trainer' | 'algs' | 'insights';
const TABS: { id: Tab; label: string }[] = [
  { id: 'timer', label: 'Timer' },
  { id: 'trainer', label: 'Trainer' },
  { id: 'algs', label: 'Algorithms' },
  { id: 'insights', label: 'Insights' },
];

function initialTab(): Tab {
  const h = location.hash.slice(1) as Tab;
  return TABS.some((t) => t.id === h) ? h : 'timer';
}

export default function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const cube = useCube();
  const loop = useLoop();
  useEffect(() => { history.replaceState(null, '', `#${tab}`); }, [tab]);
  // Pages can navigate by setting location.hash (e.g. Algorithms -> "drill my learning cases").
  useEffect(() => {
    const onHash = () => setTab(initialTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><img src="/favicon.svg" alt="" width={22} height={22} /> CubeVite</div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        <ConnectBar />
      </header>
      <main>
        {tab === 'timer' && <TimerPage />}
        {tab === 'trainer' && <TrainerPage />}
        {tab === 'algs' && <AlgsPage />}
        {tab === 'insights' && <InsightsPage />}
      </main>
      {loop && <AlgLoop key={loop.id} target={loop} />}
      {cube.device?.kind === 'virtual' && (
        <footer className="keymap muted small">
          Virtual cube keys: {Object.entries(VIRTUAL_KEYMAP).map(([k, m]) => `${k.toUpperCase()}=${m}`).join('  ')}
        </footer>
      )}
      <footer className="legal muted small">
        CubeVite is MIT licensed · uses{' '}
        <a href="https://github.com/cubing/cubing.js" target="_blank" rel="noreferrer">cubing.js</a> (MPL-2.0, unmodified) and{' '}
        <a href="https://github.com/afedotov/gan-web-bluetooth" target="_blank" rel="noreferrer">gan-web-bluetooth</a> (MIT) ·{' '}
        <a href={`${import.meta.env.BASE_URL}third-party-licenses.md`} target="_blank" rel="noreferrer">Third-party licences</a>
        {' '}· not affiliated with GAN
      </footer>
    </div>
  );
}
