declare const __APP_COMMIT__: string;
declare const __APP_BUILT__: string;

/** Commit the running build was made from ('dev' on the dev server, a trailing '+' if uncommitted changes). */
export const APP_COMMIT: string = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'test';
/** Build time, ISO string. */
export const APP_BUILT: string = typeof __APP_BUILT__ === 'string' ? __APP_BUILT__ : '';
/** e.g. "815d22f · 16 Nov 2026 17:32" */
export function versionLabel(): string {
  if (!APP_BUILT) return APP_COMMIT;
  const d = new Date(APP_BUILT);
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${APP_COMMIT} · ${date} ${time}`;
}
