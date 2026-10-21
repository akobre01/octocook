import { useEffect } from 'react'
import { KeepAwake } from '@capacitor-community/keep-awake'

// Keep the screen lit for as long as the component is mounted (requirement #1).
// Releases the lock on unmount. No-ops gracefully where unsupported (e.g. a
// desktop browser during development).
export function useKeepAwake(enabled = true) {
  useEffect(() => {
    if (!enabled) return

    KeepAwake.keepAwake().catch(() => {
      /* unsupported (e.g. web dev) — ignore */
    })

    return () => {
      KeepAwake.allowSleep().catch(() => {})
    }
  }, [enabled])
}
