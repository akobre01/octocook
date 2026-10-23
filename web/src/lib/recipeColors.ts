export interface RecipeColor {
  tint: string // translucent background (works on light & dark)
  accent: string // solid border / text / button color
}

// Fixed palette, assigned to recipes in meal order. Tints are translucent so
// they read on both themes; accents are the solid hue.
const PALETTE: RecipeColor[] = [
  { tint: 'rgba(217,119,6,0.20)', accent: '#d97706' }, // orange
  { tint: 'rgba(13,148,136,0.22)', accent: '#14b8a6' }, // teal
  { tint: 'rgba(139,92,246,0.22)', accent: '#a78bfa' }, // violet
  { tint: 'rgba(219,39,119,0.20)', accent: '#ec4899' }, // pink
  { tint: 'rgba(22,163,74,0.22)', accent: '#22c55e' }, // green
  { tint: 'rgba(37,99,235,0.22)', accent: '#60a5fa' }, // blue
]

export function recipeColor(index: number): RecipeColor {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length]
}
