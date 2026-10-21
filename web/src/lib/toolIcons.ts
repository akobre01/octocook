// Maps the controlled tool vocabulary (keys of tools/inventory.yaml and
// tools/substitutions.yaml) to an emoji. Emoji keeps this zero-asset and
// matches octocook's existing per-recipe emoji icons; swap to SVG later by
// editing only this module and ToolIcon.
//
// Unknown tools fall back to FALLBACK_TOOL_ICON.

export const FALLBACK_TOOL_ICON = '🍳'

const TOOL_ICONS: Record<string, string> = {
  // heat sources / appliances
  oven: '♨️',
  stove_burner: '🔥',
  microwave: '📟',
  // pots & pans
  saute_pan: '🍳',
  saucepan: '🫕',
  stockpot: '🍲',
  cast_iron_skillet: '🍳',
  baking_dish: '🍜',
  // mixers / blenders
  hand_mixer: '🥣',
  blender: '🧋',
  food_processor: '🥣',
  immersion_blender: '🧋',
  // hand tools
  chef_knife: '🔪',
  cutting_board: '🔪',
  mixing_bowl: '🥣',
  whisk: '🥄',
  spatula: '🥄',
  rolling_pin: '🪵',
  tongs: '🥢',
  colander: '🕳️',
  grater: '🧀',
  peeler: '🥔',
  // the human
  cook: '🧑‍🍳',
}

export function toolIcon(tool: string): string {
  return TOOL_ICONS[tool] ?? FALLBACK_TOOL_ICON
}

// Some tools have no decent emoji; render them as a simple CSS shape instead.
// A sheet pan is a plain gray rectangle (no sensible emoji exists).
export type ToolShape = 'pan'

const TOOL_SHAPES: Record<string, ToolShape> = {
  sheet_pan: 'pan',
}

export function toolShape(tool: string): ToolShape | null {
  return TOOL_SHAPES[tool] ?? null
}
