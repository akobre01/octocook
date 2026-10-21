// Pure transcript -> command matcher. Kept free of any speech engine so the
// voice logic (requirement #5) is deterministic and unit-testable. The engine
// feeds raw transcripts in; this maps them to one of the viewer's actions.

export type VoiceCommand = 'next' | 'prev' | 'timeline' | 'steps'

// Ordered rules: earlier rules win. Multi-word "view" phrases are checked
// before the bare "next"/"back" keywords so e.g. "back to steps" resolves to
// `steps`, not `prev`.
const RULES: { command: VoiceCommand; phrases: string[] }[] = [
  {
    command: 'timeline',
    phrases: [
      'full recipe', 'whole recipe', 'entire recipe', 'full view',
      'zoom out', 'overview', 'over view', 'all steps', 'timeline', 'full',
    ],
  },
  {
    command: 'steps',
    phrases: [
      'back to steps', 'step view', 'steps view', 'cooking view',
      'zoom in', 'current step', 'close',
    ],
  },
  {
    command: 'prev',
    phrases: ['previous', 'back', 'last step', 'go back', 'before'],
  },
  {
    command: 'next',
    phrases: ['next', 'forward', 'continue', 'advance', 'go on', 'onward'],
  },
]

export function matchCommand(transcript: string): VoiceCommand | null {
  const text = transcript.toLowerCase().trim()
  if (!text) return null
  for (const { command, phrases } of RULES) {
    if (phrases.some((p) => text.includes(p))) return command
  }
  return null
}
