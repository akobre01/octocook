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
  stand_mixer: '🥣',
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

// The one tool that best says what a step is, for places that show a single
// icon: an appliance or the oven beats a pot or pan, which beats the burner
// under it, which beats hand tools (the knife over the board, the bowl over
// the spoon). Unranked tools come after ranked ones, in recipe order.
const TOOL_RANK = [
  'oven', 'microwave', 'blender', 'immersion_blender', 'food_processor', 'stand_mixer', 'hand_mixer',
  'stockpot', 'saucepan', 'saute_pan', 'cast_iron_skillet', 'baking_dish', 'sheet_pan',
  'stove_burner',
  'chef_knife', 'grater', 'peeler', 'rolling_pin', 'colander', 'mixing_bowl', 'whisk', 'tongs',
  'cutting_board', 'spatula',
]

export function primaryTool(tools: string[]): string | undefined {
  const rank = (t: string) => {
    const r = TOOL_RANK.indexOf(t)
    return r === -1 ? TOOL_RANK.length : r
  }
  return tools.reduce<string | undefined>((best, t) => (best === undefined || rank(t) < rank(best) ? t : best), undefined)
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

// The full controlled tool vocabulary (emoji + shape tools), sorted, for the
// step editor's tool picker. Single source of truth shared with the icon map.
export const TOOL_VOCAB: string[] = [
  ...Object.keys(TOOL_ICONS),
  ...Object.keys(TOOL_SHAPES),
].sort()
