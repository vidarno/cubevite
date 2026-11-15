/** Top-down last-layer diagram (yellow on top, green front) generated from a cross-down state. */
import { useId, type ReactNode } from 'react';
import { pllArrows, type PllArrow } from '../cube/pllArrows';
import { F2LDiagram } from './F2LDiagram';

const PLL_COLORS: Record<string, string> = {
  U: 'var(--c-yellow)', F: 'var(--c-green)', R: 'var(--c-orange)',
  B: 'var(--c-blue)', L: 'var(--c-red)', D: 'var(--c-white)',
};

// Facelet indices: U face rows (back->front), and side stickers in screen order.
const U_GRID = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const BACK = [47, 46, 45]; // left -> right on screen
const FRONT = [18, 19, 20];
const LEFT = [36, 37, 38]; // top -> bottom
const RIGHT = [11, 10, 9];

const arrowCache = new Map<string, PllArrow[]>();
const arrowsFor = (state: string) => {
  let a = arrowCache.get(state);
  if (!a) arrowCache.set(state, (a = pllArrows(state)));
  return a;
};

/**
 * OLL: U-colour stickers yellow, rest grey. PLL: full colours.
 * EO / CP (2-look step 1): like OLL / PLL but only edges / only corners; the other pieces are blanked
 * (CP keeps the whole top face: after OLL it is all yellow).
 * F2L: isometric front-right slot picture (see F2LDiagram).
 */
export type DiagramMode = 'OLL' | 'PLL' | 'EO' | 'CP' | 'F2L';

// Stickers of LL corners (U-face corners + side corner stickers); everything else in the LL is an edge or centre.
const CORNER_STICKERS = new Set([0, 2, 6, 8, 47, 45, 18, 20, 36, 38, 11, 9]);
const CENTRE = 4;

export function LLDiagram({ state, mode, size = 96, arrows = false }: {
  state: string; mode: DiagramMode; size?: number;
  /** PLL / CP only: draw arrows showing where each piece goes. */
  arrows?: boolean;
}) {
  const markerId = useId();
  if (mode === 'F2L') return <F2LDiagram state={state} size={size} />;
  const color = (i: number) => {
    const c = state[i];
    const corner = CORNER_STICKERS.has(i);
    if (i !== CENTRE && ((mode === 'EO' && corner) || (mode === 'CP' && !corner && i > 8))) return 'var(--c-blank)';
    if (mode === 'OLL' || mode === 'EO') return c === 'U' ? 'var(--c-yellow)' : 'var(--c-gray)';
    return PLL_COLORS[c];
  };
  const arrowList = mode === 'PLL' ? arrowsFor(state) : mode === 'CP' ? arrowsFor(state).filter((a) => a.kind === 'corner') : [];
  const cell = 10;
  const strip = 3;
  const gap = 0.6;
  const o = strip + gap; // grid origin
  const total = o * 2 + cell * 3;
  const rects: ReactNode[] = [];
  U_GRID.forEach((idx, k) => {
    const r = Math.floor(k / 3), c = k % 3;
    rects.push(<rect key={`u${k}`} x={o + c * cell + 0.4} y={o + r * cell + 0.4} width={cell - 0.8} height={cell - 0.8} rx={1.2} fill={color(idx)} />);
  });
  const side = (list: number[], horiz: boolean, fixed: number, key: string) =>
    list.forEach((idx, k) => {
      const along = o + k * cell + 0.8;
      rects.push(horiz
        ? <rect key={`${key}${k}`} x={along} y={fixed} width={cell - 1.6} height={strip} rx={0.8} fill={color(idx)} />
        : <rect key={`${key}${k}`} x={fixed} y={along} width={strip} height={cell - 1.6} rx={0.8} fill={color(idx)} />);
    });
  side(BACK, true, 0, 'b');
  side(FRONT, true, o + cell * 3 + gap, 'f');
  side(LEFT, false, 0, 'l');
  side(RIGHT, false, o + cell * 3 + gap, 'r');
  return (
    <svg className="ll-diagram" viewBox={`0 0 ${total} ${total}`} width={size} height={size} role="img">
      <rect x={o - 0.4} y={o - 0.4} width={cell * 3 + 0.8} height={cell * 3 + 0.8} rx={1.5} fill="var(--c-plastic)" />
      {rects}
      {arrows && <Arrows list={arrowList} origin={o} cell={cell} id={markerId} />}
    </svg>
  );
}

function Arrows({ list, origin, cell, id }: { list: PllArrow[]; origin: number; cell: number; id: string }) {
  if (!list.length) return null;
  const centre = (k: number): [number, number] => [origin + (k % 3) * cell + cell / 2, origin + Math.floor(k / 3) * cell + cell / 2];
  const inset = 2.6;
  return (
    <g className="pll-arrows">
      <defs>
        <marker id={`${id}h`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9 z" fill="var(--arrow)" />
        </marker>
      </defs>
      {list.map((a) => {
        const [x1, y1] = centre(a.from), [x2, y2] = centre(a.to);
        const len = Math.hypot(x2 - x1, y2 - y1);
        const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
        return (
          <line key={`${a.kind}${a.from}-${a.to}`} className={`arrow-${a.kind}`}
            x1={x1 + ux * inset} y1={y1 + uy * inset} x2={x2 - ux * inset} y2={y2 - uy * inset}
            stroke="var(--arrow)" strokeWidth={1.05} strokeLinecap="round"
            markerEnd={`url(#${id}h)`} markerStart={a.swap ? `url(#${id}h)` : undefined} />
        );
      })}
    </g>
  );
}
