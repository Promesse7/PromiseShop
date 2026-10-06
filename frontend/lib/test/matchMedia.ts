/**
 * Test-only matchMedia mock. jsdom has no matchMedia, so vitest.setup installs this with the
 * defaults below: a desktop viewport (min-width: 1024px matches) and prefers-reduced-motion
 * ON, which makes every motion animation instant and unmounts exits immediately in tests.
 * A test that needs the phone layout or real animations calls setMatchMedia({...}).
 */
export interface MediaState {
  desktop: boolean;
  reducedMotion: boolean;
}

const DEFAULTS: MediaState = { desktop: true, reducedMotion: true };
let state: MediaState = { ...DEFAULTS };
const listeners = new Set<() => void>();

function evaluate(query: string): boolean {
  if (query.includes("prefers-reduced-motion")) return state.reducedMotion;
  const min = /min-width:\s*(\d+)px/.exec(query);
  if (min) return Number(min[1]) <= (state.desktop ? 1280 : 390);
  const max = /max-width:\s*(\d+)px/.exec(query);
  if (max) return Number(max[1]) >= (state.desktop ? 1280 : 390);
  return false;
}

export function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) =>
      ({
        get matches() {
          return evaluate(query);
        },
        media: query,
        onchange: null,
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
        addListener: (cb: () => void) => listeners.add(cb),
        removeListener: (cb: () => void) => listeners.delete(cb),
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

/** Switch the simulated viewport / motion preference; subscribed hooks re-render. */
export function setMatchMedia(next: Partial<MediaState>): void {
  state = { ...state, ...next };
  listeners.forEach((cb) => cb());
}

export function resetMatchMedia(): void {
  state = { ...DEFAULTS };
}
