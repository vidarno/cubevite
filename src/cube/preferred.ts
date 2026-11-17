/**
 * Preferred algs per case: the user picks one of a case's algs (main or an alternative) or adds
 * their own (validated by `validateCaseAlg` in algValidate.ts). The preferred alg goes first
 * wherever a case's algs are listed, shown, followed or looped. The main DB alg still defines the
 * case (its picture and setup), so a preference never changes which state a case is.
 *
 * The current preferences live in a small registry here (set by the persisted store in
 * `state/data.ts`), so drill/hint code deep in `src/cube/` sees them without threading them through.
 * Every function also takes the preferences explicitly, for tests.
 */

export interface AlgPref {
  /** The alg to use first (one of the case's DB algs or a custom one). Absent = the main alg. */
  preferred?: string;
  /** The user's own algs for the case (validated when added). */
  custom?: string[];
}
export type AlgPrefs = Record<string, AlgPref>;

let current: AlgPrefs = {};
let version = 0;

/** Set the preferences the registry uses (called by the persisted store on load and change). */
export function setAlgPrefs(p: AlgPrefs): void {
  current = p;
  version++;
}
export const algPrefs = (): AlgPrefs => current;
/** Bumped on every change (for caches built from the alg lists, e.g. alg identification). */
export const algPrefsVersion = () => version;

export const customAlgs = (id: string, p: AlgPrefs = current): string[] => p[id]?.custom ?? [];

/**
 * A case's algs in use order: the preferred one, then the main alg, the DB alternatives and the
 * user's own algs (no duplicates). A preference that is none of these is ignored.
 */
export function caseAlgList(c: { id: string; alg?: string; alts?: string[] }, p: AlgPrefs = current): string[] {
  const all = [...new Set([c.alg, ...(c.alts ?? []), ...customAlgs(c.id, p)].filter((a): a is string => !!a))];
  const pref = p[c.id]?.preferred;
  return pref && all.includes(pref) ? [pref, ...all.filter((a) => a !== pref)] : all;
}

/** Reorder alg plans (any objects with an `alg`) so the case's preferred alg comes first. */
export function preferredFirst<T extends { alg: string }>(id: string, plans: T[], p: AlgPrefs = current): T[] {
  const pref = p[id]?.preferred;
  const i = pref ? plans.findIndex((x) => x.alg === pref) : -1;
  return i > 0 ? [plans[i], ...plans.slice(0, i), ...plans.slice(i + 1)] : plans;
}

const tidy = (p: AlgPrefs, id: string, e: AlgPref): AlgPrefs => {
  const out = { ...p };
  const clean: AlgPref = {};
  if (e.preferred) clean.preferred = e.preferred;
  if (e.custom?.length) clean.custom = e.custom;
  if (clean.preferred || clean.custom) out[id] = clean;
  else delete out[id];
  return out;
};

/** Make `alg` the case's preferred alg; `null` (or the main alg) goes back to the main alg. */
export function withPreferred(p: AlgPrefs, id: string, alg: string | null, mainAlg?: string): AlgPrefs {
  return tidy(p, id, { ...p[id], preferred: alg && alg !== mainAlg ? alg : undefined });
}

/** Add an own alg (already validated) to a case and make it preferred. */
export function withCustom(p: AlgPrefs, id: string, alg: string): AlgPrefs {
  const custom = customAlgs(id, p);
  return tidy(p, id, { preferred: alg, custom: custom.includes(alg) ? custom : [...custom, alg] });
}

/** Remove an own alg (if it was preferred, the main alg is preferred again). */
export function withoutCustom(p: AlgPrefs, id: string, alg: string): AlgPrefs {
  const e = p[id] ?? {};
  return tidy(p, id, { preferred: e.preferred === alg ? undefined : e.preferred, custom: (e.custom ?? []).filter((a) => a !== alg) });
}
