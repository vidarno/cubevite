/**
 * Algorithm identification for last-layer steps: which database alg did the solver execute?
 *
 * The step's moves (cross-down frame, as a smart cube reports them) are put in canonical
 * face-turn form, leading/trailing AUFs are stripped, and the result is looked up among the
 * step's candidate algs in face-turn form (main alg + alternatives, each also conjugated by
 * y / y2 / y' for algs done from another side). A 1-look step that matches nothing is also tried
 * as two 2-look algs back to back. Anything else is reported as an own alg with its length.
 */
import { tokenize } from './facelets';
import { canonicalFaceTurns, toFaceTurns } from './faceTurns';
import { OLL, PLL, type AlgCase } from './algs';
import { OCLL_CASES, OLL_EDGES_CASES, PLL_CORNERS_CASES, PLL_EDGES_CASES } from './twoLook';
import type { LLStep, LLStepKind } from './cfop';
import { algPrefsVersion, customAlgs } from './preferred';

export interface AlgMatch {
  caseId: string;
  /** The alg as written in the database. */
  alg: string;
  /** -1 = the case's main alg, otherwise the index into `alts`. */
  alt: number;
  /** One of the user's own algs for the case (then `alt` is -1). */
  custom?: boolean;
  /** Rotation the alg was done from ('' = as written; 'y2' = from the back, ...). */
  rotation: string;
}

export interface AlgIdentification {
  /** Single matching alg, or null. */
  match: AlgMatch | null;
  /** A 1-look step executed as two 2-look algs (step 1, step 2). */
  twoLook?: [AlgMatch, AlgMatch];
  /** Face turns (half turns count 1) without leading/trailing AUFs. */
  moves: number;
  /** Face-turn length of the reference (main) alg of the step's case, if known. */
  refMoves: number | null;
}

const ROTATIONS = ['', 'y', 'y2', "y'"];
const INVERSE_ROT: Record<string, string> = { '': '', y: "y'", y2: 'y2', "y'": 'y' };

/** Strip U turns from the leading and trailing U/D-axis blocks (U commutes with D). */
export function stripAuf(tokens: string[]): string[] {
  const isUD = (t: string) => t[0] === 'U' || t[0] === 'D';
  let a = 0;
  while (a < tokens.length && isUD(tokens[a])) a++;
  let b = tokens.length;
  while (b > a && isUD(tokens[b - 1])) b--;
  const keepD = (ts: string[]) => ts.filter((t) => t[0] === 'D');
  return [...keepD(tokens.slice(0, a)), ...tokens.slice(a, b), ...(b > a ? keepD(tokens.slice(b)) : [])];
}

/** Canonical lookup key: canonical face turns with AUFs stripped. */
export function algKey(faceTurns: string): string {
  return stripAuf(tokenize(canonicalFaceTurns(faceTurns))).join(' ');
}

const STEP_CASES: Record<LLStepKind, AlgCase[]> = {
  OLL,
  'OLL edges': OLL_EDGES_CASES,
  OCLL: OCLL_CASES,
  PLL,
  'PLL corners': PLL_CORNERS_CASES,
  'PLL edges': PLL_EDGES_CASES,
};

const indexCache = new Map<LLStepKind, Map<string, AlgMatch[]>>();
let indexVersion = -1;

/** key -> candidate matches for a step kind (built lazily; rebuilt when the user's own algs change). */
function indexFor(kind: LLStepKind): Map<string, AlgMatch[]> {
  if (indexVersion !== algPrefsVersion()) { indexCache.clear(); indexVersion = algPrefsVersion(); }
  let idx = indexCache.get(kind);
  if (idx) return idx;
  idx = new Map();
  for (const c of STEP_CASES[kind]) {
    const own = customAlgs(c.id).filter((a) => a !== c.alg && !c.alts?.includes(a));
    const algs = [...[c.alg, ...(c.alts ?? [])].map((alg, i) => ({ alg, alt: i - 1, custom: false })),
      ...own.map((alg) => ({ alg, alt: -1, custom: true }))];
    for (const { alg, alt, custom } of algs) {
      for (const rotation of ROTATIONS) {
        const key = algKey(toFaceTurns(`${rotation} ${alg} ${INVERSE_ROT[rotation]}`));
        const list = idx!.get(key) ?? [];
        if (!list.some((m) => m.caseId === c.id && m.alt === alt && !!m.custom === custom)) {
          list.push({ caseId: c.id, alg, alt, rotation, ...(custom ? { custom } : {}) });
        }
        idx!.set(key, list);
      }
    }
  }
  indexCache.set(kind, idx);
  return idx;
}

/** Best match of a face-turn sequence for a step kind, preferring the expected case, then no rotation, then the main alg. */
function lookup(kind: LLStepKind, moves: string, caseId: string | null): AlgMatch | null {
  const list = indexFor(kind).get(algKey(moves));
  if (!list?.length) return null;
  const score = (m: AlgMatch) => (m.caseId === caseId ? 0 : 100) + (m.rotation ? 10 : 0) + (m.custom ? 5 : m.alt + 1);
  return [...list].sort((a, b) => score(a) - score(b))[0];
}

const TWO_LOOK_OF: Partial<Record<LLStepKind, [LLStepKind, LLStepKind]>> = {
  OLL: ['OLL edges', 'OCLL'],
  PLL: ['PLL corners', 'PLL edges'],
};

const caseById = new Map([...OLL, ...PLL, ...OLL_EDGES_CASES, ...PLL_CORNERS_CASES].map((c) => [c.id, c]));

/**
 * Identify the alg used for a last-layer step.
 * @param kind the step kind (decides the candidate set)
 * @param caseId the case recognised at the step's start (preferred among equal matches; gives the reference length)
 * @param moves the step's moves, face turns in the cross-down frame (cube-reported quarter turns are fine)
 */
export function identifyAlg(kind: LLStepKind, caseId: string | null, moves: string[]): AlgIdentification {
  const joined = moves.join(' ');
  const ref = caseId ? caseById.get(caseId) : undefined;
  const out: AlgIdentification = {
    match: lookup(kind, joined, caseId),
    moves: algKey(joined) ? tokenize(algKey(joined)).length : 0,
    refMoves: ref ? tokenize(algKey(toFaceTurns(ref.alg))).length : null,
  };
  const halves = TWO_LOOK_OF[kind];
  if (!out.match && halves) {
    for (let i = 1; i < moves.length; i++) {
      const a = lookup(halves[0], moves.slice(0, i).join(' '), null);
      if (!a) continue;
      const b = lookup(halves[1], moves.slice(i).join(' '), null);
      if (b) { out.twoLook = [a, b]; break; }
    }
  }
  return out;
}

/** Nicknames shown next to DB ids ("OLL 27 (Sune)"). */
const NICKNAMES: Record<string, string> = {
  'OLL 21': 'H', 'OLL 22': 'Pi', 'OLL 23': 'Headlights', 'OLL 24': 'Chameleon',
  'OLL 25': 'Bowtie', 'OLL 26': 'Antisune', 'OLL 27': 'Sune',
};

/** Display name of a case: "OLL 27 (Sune)", "T-perm", "Line". */
export function caseName(caseId: string): string {
  if (caseId.startsWith('2L ')) return caseId.replace(/^2L (OLL|PLL) /, '');
  const c = caseById.get(caseId);
  if (c?.set === 'PLL') return c.name;
  return NICKNAMES[caseId] ? `${caseId} (${NICKNAMES[caseId]})` : caseId;
}

/** PLL whose main alg is `alg` (2-look corner cases reuse T / Aa / Y). */
const pllNameOfAlg = (alg: string) => PLL.find((c) => c.alg === alg)?.name;

/** Label of one match: "OLL 27 (Sune)", "Headlights: Aa-perm", "T-perm (alt 1, from y2)". */
export function matchLabel(m: AlgMatch): string {
  let label = caseName(m.caseId);
  if (m.caseId.startsWith('2L PLL ')) {
    const viaPll = pllNameOfAlg(m.alg);
    if (viaPll) label += `: ${viaPll}`;
  }
  const notes = [m.custom ? 'own alg' : m.alt >= 0 ? `alt ${m.alt + 1}` : '', m.rotation ? `from ${m.rotation}` : ''].filter(Boolean);
  return notes.length ? `${label} (${notes.join(', ')})` : label;
}

/** Label for a step's identification: the alg(s) used, or "own alg, 14 moves (DB 12)". */
export function identificationLabel(id: AlgIdentification): string {
  if (id.match) return matchLabel(id.match);
  if (id.twoLook) return `2-look: ${matchLabel(id.twoLook[0])} + ${matchLabel(id.twoLook[1])}`;
  return `own alg, ${id.moves} moves${id.refMoves !== null ? ` (DB ${id.refMoves})` : ''}`;
}

/**
 * What to show for a last-layer step: the identified alg ("OLL 27 (Sune)", "Headlights: T-perm"),
 * the case plus "own alg, N moves (DB M)", or just the case for steps analysed before identification.
 */
export function stepLabel(step: Pick<LLStep, 'caseId' | 'alg'>): string {
  const cn = step.caseId ? caseName(step.caseId) : '?';
  if (!step.alg) return cn;
  if (step.alg.match || step.alg.twoLook) return identificationLabel(step.alg);
  return `${cn} · ${identificationLabel(step.alg)}`;
}
