import { useCallback, useEffect, useRef, useState } from 'react'
import { createCapacitorSpeechEngine, type SpeechEngine } from './speechEngine'
import { matchCommand, type VoiceCommand } from './voiceGrammar'

// Wires the speech engine to the pure grammar matcher and dispatches commands.
// Partial results fire repeatedly, so identical commands are de-duped within a
// short window to avoid double-advancing.
export function useVoiceCommands(onCommand: (c: VoiceCommand) => void) {
  const engineRef = useRef<SpeechEngine | null>(null)
  const onCommandRef = useRef(onCommand)
  useEffect(() => {
    onCommandRef.current = onCommand
  }, [onCommand])

  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [lastHeard, setLastHeard] = useState('')
  const lastDispatch = useRef<{ cmd: VoiceCommand; at: number } | null>(null)

  useEffect(() => {
    const engine = createCapacitorSpeechEngine()
    engineRef.current = engine
    engine.available().then(setSupported).catch(() => setSupported(false))
    return () => {
      engine.stop().catch(() => {})
    }
  }, [])

  const start = useCallback(async () => {
    const engine = engineRef.current
    if (!engine) return
    const granted = await engine.requestPermission()
    if (!granted) return
    await engine.start((text) => {
      setLastHeard(text)
      const cmd = matchCommand(text)
      if (!cmd) return
      const now = Date.now()
      const last = lastDispatch.current
      if (last && last.cmd === cmd && now - last.at < 1500) return
      lastDispatch.current = { cmd, at: now }
      onCommandRef.current(cmd)
    })
    setListening(true)
  }, [])

  const stop = useCallback(async () => {
    await engineRef.current?.stop()
    setListening(false)
  }, [])

  const toggle = useCallback(() => {
    if (listening) void stop()
    else void start()
  }, [listening, start, stop])

  return { supported, listening, lastHeard, start, stop, toggle }
}
