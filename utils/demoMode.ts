/**
 * Demo mode
 *
 * Flowize normally requires a GitHub login and a running local bridge. Demo mode
 * lets anyone explore the full workflow at `/demo` without either: the auth page
 * is skipped, the app boots with seeded sample data, and every network-backed
 * service (GitHub REST, local bridge, Gemini) is answered by an in-memory
 * simulation instead of a real request.
 *
 * The mode is derived from the URL only (no persistence), so `/` always behaves
 * like the real app even in a tab that previously visited `/demo`.
 */

export const DEMO_PATH = '/demo';

/** Prefix applied to every localStorage key while in demo mode. */
export const DEMO_STORAGE_PREFIX = 'flowize.demo.';

const detectDemoMode = (): boolean => {
    if (typeof window === 'undefined') return false;

    const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
    if (path === DEMO_PATH || path.endsWith(DEMO_PATH)) {
        return true;
    }

    try {
        const demoParam = new URLSearchParams(window.location.search).get('demo');
        return demoParam === '1' || demoParam === 'true';
    } catch {
        return false;
    }
};

// Evaluated once per page load: the URL cannot change without a reload here
// (the app has no client-side router), so the flag is stable for the session.
const demoActive = detectDemoMode();

export const isDemoMode = (): boolean => demoActive;

/**
 * Namespaces a localStorage key so demo data never overwrites a real session:
 * `flowize.tasks.v1` becomes `flowize.demo.tasks.v1`.
 */
export const scopedStorageKey = (key: string): string => {
    if (!demoActive) return key;
    return key.startsWith('flowize.')
        ? `${DEMO_STORAGE_PREFIX}${key.slice('flowize.'.length)}`
        : `${DEMO_STORAGE_PREFIX}${key}`;
};

/** Removes every persisted demo key, leaving real session data untouched. */
export const clearDemoStorage = (): void => {
    if (typeof window === 'undefined') return;

    try {
        const doomed: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key && key.startsWith(DEMO_STORAGE_PREFIX)) {
                doomed.push(key);
            }
        }
        doomed.forEach(key => window.localStorage.removeItem(key));
    } catch {
        // Storage unavailable (private mode / disabled) - nothing to clean up.
    }
};

/** Enters demo mode from the login page. */
export const enterDemoMode = (): void => {
    if (typeof window === 'undefined') return;
    window.location.href = DEMO_PATH;
};

/** Wipes seeded data and returns to the real app. */
export const exitDemoMode = (): void => {
    clearDemoStorage();
    if (typeof window === 'undefined') return;
    window.location.href = '/';
};

/** Reseeds the demo by clearing its storage and reloading `/demo`. */
export const resetDemoMode = (): void => {
    clearDemoStorage();
    if (typeof window === 'undefined') return;
    window.location.href = DEMO_PATH;
};

/** Simulated latency so demo actions feel like real async work. */
export const demoDelay = (ms: number): Promise<void> => (
    new Promise(resolve => setTimeout(resolve, ms))
);
