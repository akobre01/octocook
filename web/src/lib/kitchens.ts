import type { KitchenPreset } from '../types'

// Bundled kitchen presets, mirroring server/presets/<name>/{inventory,
// substitutions}.yaml so the offline scheduler has the same tool counts and
// substitution graph the Python scheduler uses. Add a preset by adding an
// entry here.

const DEFAULT: KitchenPreset = {
  name: 'default',
  inventory: {
    baking_dish: 2,
    blender: 1,
    cast_iron_skillet: 1,
    chef_knife: 1,
    colander: 1,
    cook: 1,
    cutting_board: 2,
    food_processor: 1,
    grater: 1,
    hand_mixer: 1,
    immersion_blender: 1,
    microwave: 1,
    mixing_bowl: 4,
    muffin_pan: 1,
    oven: 1,
    peeler: 1,
    rolling_pin: 1,
    saucepan: 2,
    saute_pan: 2,
    sheet_pan: 2,
    spatula: 2,
    stockpot: 1,
    stove_burner: 4,
    tongs: 1,
    whisk: 1,
  },
  substitutions: {
    stand_mixer: [
      { tool: 'hand_mixer', time_multiplier: 1.2, note: 'Use hand mixer instead of stand mixer' },
      { tool: null, time_multiplier: 1.5, note: 'Mix/knead by hand' },
    ],
    food_processor: [
      { tool: 'blender', time_multiplier: 1.0, note: 'Use blender (scrape sides as needed)' },
      { tool: 'chef_knife', time_multiplier: 3.0, note: 'Chop by hand' },
    ],
    immersion_blender: [
      { tool: 'blender', time_multiplier: 1.0, note: 'Use countertop blender (transfer in batches)' },
      { tool: 'potato_masher', time_multiplier: 1.5, note: 'Mash by hand' },
    ],
    microwave: [
      { tool: 'stove_burner', time_multiplier: 1.5, note: 'Warm on the stovetop instead of microwave' },
    ],
    mortar_and_pestle: [
      { tool: 'food_processor', time_multiplier: 0.5, note: 'Pulse in food processor' },
      { tool: 'chef_knife', time_multiplier: 1.5, note: 'Chop fine and crush with knife side' },
    ],
    dutch_oven: [
      { tool: 'stockpot', time_multiplier: 1.0, note: 'Use stockpot (oven steps may need a baking dish instead)' },
    ],
    cast_iron_skillet: [
      { tool: 'saute_pan', time_multiplier: 1.0, note: 'Use saute pan (less heat retention)' },
    ],
    rolling_pin: [
      { tool: null, time_multiplier: 1.2, note: 'Roll with a wine bottle or press by hand' },
    ],
    // Common tools recipes name that aren't worth listing in inventory: each
    // has an obvious stand-in, so a recipe that mentions one still schedules.
    muffin_tin: [{ tool: 'muffin_pan', time_multiplier: 1.0, note: 'Use muffin pan' }],
    potato_masher: [{ tool: null, time_multiplier: 1.3, note: 'Mash with a fork' }],
    wire_rack: [{ tool: null, time_multiplier: 1.0, note: 'Cool on a trivet or the stovetop' }],
    refrigerator: [{ tool: null, time_multiplier: 1.0, note: 'Chill in the fridge' }],
    biscuit_cutter: [{ tool: null, time_multiplier: 1.0, note: 'Cut with the rim of a glass' }],
    fine_mesh_sieve: [
      { tool: 'colander', time_multiplier: 1.0, note: 'Use colander (line with a paper towel for fine solids)' },
    ],
    fine_mesh_strainer: [
      { tool: 'colander', time_multiplier: 1.0, note: 'Use colander (line with a paper towel for fine solids)' },
    ],
    zester: [{ tool: 'grater', time_multiplier: 1.0, note: 'Use the fine side of the grater' }],
    small_pan: [{ tool: 'saucepan', time_multiplier: 1.0, note: 'Use a saucepan' }],
    small_bowl: [{ tool: 'mixing_bowl', time_multiplier: 1.0, note: 'Use a mixing bowl' }],
    steamer_basket: [
      { tool: 'colander', time_multiplier: 1.0, note: 'Steam in a colander set over a covered pot' },
    ],
    rice_cooker: [{ tool: 'saucepan', time_multiplier: 1.0, note: 'Cook rice in a covered saucepan' }],
    pressure_cooker: [
      { tool: 'stockpot', time_multiplier: 2.5, note: 'Simmer covered in a stockpot (takes longer)' },
    ],
    air_fryer: [{ tool: 'oven', time_multiplier: 1.3, note: 'Roast on a sheet pan in a hot oven' }],
    electric_kettle: [{ tool: 'saucepan', time_multiplier: 1.0, note: 'Boil water in a saucepan' }],
    ladle: [{ tool: null, time_multiplier: 1.0, note: 'Use a measuring cup to scoop' }],
    mug: [{ tool: null, time_multiplier: 1.0, note: 'Use any heatproof cup' }],
    liquid_measuring_cup: [{ tool: null, time_multiplier: 1.0, note: 'Use any measuring cup or a bowl' }],
    canning_jar: [{ tool: null, time_multiplier: 1.0, note: 'Use any clean lidded jar' }],
  },
}

export const KITCHENS: KitchenPreset[] = [DEFAULT]

export function getKitchen(name: string): KitchenPreset {
  return KITCHENS.find((k) => k.name === name) ?? DEFAULT
}
