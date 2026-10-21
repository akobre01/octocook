import { SpeechRecognition } from '@capacitor-community/speech-recognition'

// A thin, swappable speech layer. The viewer talks only to this interface, so
// the underlying engine (today the Capacitor community plugin; tomorrow a
// fully-offline vosk-browser WASM model) can be replaced without touching the
// UI or the pure grammar matcher.
export interface SpeechEngine {
  available(): Promise<boolean>
  requestPermission(): Promise<boolean>
  start(onTranscript: (text: string) => void): Promise<void>
  stop(): Promise<void>
}

// Capacitor implementation backed by the native Android SpeechRecognizer.
//
// Android only listens for a single utterance per `start()` call, so rather
// than relying on a 'stopped' event to re-arm (which proved unreliable), we run
// an explicit loop: await one utterance, emit its matches, then immediately
// listen again. A rejected start (silence timeout / "no match") is expected —
// we pause briefly and re-listen. This keeps the mic continuously open while
// voice control is on.
export function createCapacitorSpeechEngine(): SpeechEngine {
  let active = false

  const listenLoop = async (onTranscript: (text: string) => void) => {
    while (active) {
      try {
        const { matches } = await SpeechRecognition.start({
          language: 'en-US',
          partialResults: false,
          popup: false,
          maxResults: 3,
        })
        if (matches) for (const m of matches) onTranscript(m)
      } catch {
        // Silence timeout / no-match / transient busy — back off briefly and
        // re-arm so a quiet stretch doesn't end voice control.
        await new Promise((r) => setTimeout(r, 250))
      }
    }
  }

  return {
    async available() {
      try {
        const { available } = await SpeechRecognition.available()
        return available
      } catch {
        return false
      }
    },

    async requestPermission() {
      try {
        const { speechRecognition } = await SpeechRecognition.requestPermissions()
        return speechRecognition === 'granted'
      } catch {
        return false
      }
    },

    async start(onTranscript) {
      if (active) return
      active = true
      void listenLoop(onTranscript)
    },

    async stop() {
      active = false
      try {
        await SpeechRecognition.stop()
      } catch {
        /* ignore */
      }
    },
  }
}
