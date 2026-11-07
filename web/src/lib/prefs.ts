// On/off preferences kept in this browser only (per-device conveniences).
// Storage can be unavailable (private mode etc.) — then the default is used
// and the toggle still works for the session.

function load(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function save(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    // ignore
  }
}

// Timing mode (⏱ in a recipe): off until the cook turns it on.
const TIMING_KEY = 'octocook.timingMode'
export const loadTimingPref = () => load(TIMING_KEY)
export const saveTimingPref = (on: boolean) => save(TIMING_KEY, on)
