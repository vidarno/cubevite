/**
 * Isometric F2L case picture (U, F and R faces; yellow top, green front) from a cross-down state.
 * The front-right pair's corner and edge are drawn in full colour wherever they are; last-layer
 * pieces are grey (also when they sit in the slot), the solved first two layers keep their colours.
 */
import { STICKERS } from '../cube/facelets';

const COLORS: Record<string, string> = {
  U: 'var(--c-yellow)', F: 'var(--c-green)', R: 'var(--c-orange)',
  B: 'var(--c-blue)', L: 'var(--c-red)', D: 'var(--c-white)',
};

type V3 = [number, number, number];
const VISIBLE = new Set(['0,1,0', '0,0,1', '1,0,0']); // U, F, R normals
/** Isometric projection: x (R) right-down, z (F) left-down, y up. */
const project = ([x, y, z]: V3): [number, number] => [(x - z) * 0.866, (x + z) * 0.5 - y];

const cubieKey = (p: V3) => p.join(',');
const STICKERS_BY_CUBIE = new Map<string, number[]>();
STICKERS.forEach((s, i) => {
  const k = cubieKey(s.pos as V3);
  STICKERS_BY_CUBIE.set(k, [...(STICKERS_BY_CUBIE.get(k) ?? []), i]);
});

const PAIR = new Set(['DFR', 'FR']); // sorted colour sets of the FR pair's pieces
const sorted = (s: string) => [...s].sort().join('');

export function F2LDiagram({ state, size = 96 }: { state: string; size?: number }) {
  const polys: { pts: string; fill: string; key: number }[] = [];
  STICKERS.forEach((s, i) => {
    const n = s.normal as V3;
    if (!VISIBLE.has(n.join(','))) return;
    const pos = s.pos as V3;
    const cubie = STICKERS_BY_CUBIE.get(cubieKey(pos))!;
    const colours = sorted(cubie.map((j) => state[j]).join(''));
    const isPair = cubie.length > 1 && PAIR.has(colours);
    const isCentre = cubie.length === 1;
    // Last-layer pieces (anything with the U colour) are grey wherever they are, e.g. in the empty slot.
    const llPiece = !isCentre && colours.includes('U');
    const fill = isPair || isCentre || !llPiece ? COLORS[state[i]] : 'var(--c-gray)';
    // Sticker square: centre on the face, spanned by the two axes perpendicular to the normal.
    const axes = [0, 1, 2].filter((a) => n[a] === 0);
    const c: V3 = [pos[0] + n[0] * 0.5, pos[1] + n[1] * 0.5, pos[2] + n[2] * 0.5];
    const h = 0.44;
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const p: V3 = [...c];
      p[axes[0]] += u * h; p[axes[1]] += v * h;
      return project(p).map((x) => x.toFixed(3)).join(',');
    }).join(' ');
    polys.push({ pts, fill, key: i });
  });
  // Bounds of the projected cube: x in ±2.6, y in ±3.
  const w = 3 * 0.866 * 2, top = -1.5 - 1.5, hgt = 3 + 1.5 * 2;
  const pad = 0.15;
  const outline = ([[-1.5, 1.5, -1.5], [1.5, 1.5, -1.5], [1.5, -1.5, -1.5], [1.5, -1.5, 1.5], [-1.5, -1.5, 1.5], [-1.5, 1.5, 1.5]] as V3[])
    .map((p) => project(p).join(',')).join(' ');
  return (
    <svg className="ll-diagram f2l-diagram" viewBox={`${-w / 2 - pad} ${top - pad} ${w + pad * 2} ${hgt + pad * 2}`}
      width={size} height={size} role="img">
      <polygon points={outline} fill="var(--c-plastic)" stroke="var(--c-plastic)" strokeWidth={0.12} strokeLinejoin="round" />
      {polys.map((p) => <polygon key={p.key} points={p.pts} fill={p.fill} />)}
    </svg>
  );
}
