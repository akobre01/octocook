// Fuzzy keyword -> emoji for free-text ingredient phrases like "3 eggs" or
// "1/3 cup olive oil". Matched against the lowercased phrase in order, so more
// specific keywords must come first (e.g. "olive oil" before "oil"). Unmatched
// ingredients fall back to a neutral icon.

export const FALLBACK_INGREDIENT_ICON = '🥄'

const INGREDIENT_ICONS: [string, string][] = [
  ['coconut', '🥥'],
  ['squash', '🎃'],
  ['lentil', '🫘'],
  ['chickpea', '🫘'],
  ['bean', '🫘'],
  ['spinach', '🥬'],
  ['chard', '🥬'],
  ['stock', '🥣'],
  ['broth', '🥣'],
  ['lime', '🍋'],
  ['cayenne', '🌶️'],
  ['chile', '🌶️'],
  ['paprika', '🌶️'],
  ['shallot', '🧅'],
  ['bread', '🍞'],
  ['honey', '🍯'],
  ['yeast', '🫙'],
  ['oat', '🌾'],
  ['cashew', '🥜'],
  ['date', '🟤'],
  ['cocoa', '🍫'],
  ['chocolate', '🍫'],
  ['maple', '🍁'],
  ['farro', '🌾'],
  ['wild rice', '🍚'],
  ['mirepoix', '🧅'],
  ['carrot', '🥕'],
  ['parsnip', '🥕'],
  ['sausage', '🌭'],
  ['turmeric', '🟡'],
  ['curry', '🍛'],
  ['raisin', '🍇'],
  ['cilantro', '🌿'],
  ['celery', '🥬'],
  ['ginger', '🫚'],
  ['egg', '🥚'],
  ['sugar', '🍬'],
  ['flour', '🌾'],
  ['baking powder', '🧁'],
  ['baking soda', '🧁'],
  ['salt', '🧂'],
  ['olive oil', '🫒'],
  ['sesame oil', '🫗'],
  ['sesame', '◻️'],
  ['oil', '🫗'],
  ['milk', '🥛'],
  ['lemon', '🍋'],
  ['zest', '🍋'],
  ['butter', '🧈'],
  ['walnut', '🥜'],
  ['nut', '🥜'],
  ['pomegranate', '🔴'],
  ['bell pepper', '🫑'],
  ['red pepper', '🫑'],
  ['aleppo', '🌶️'],
  ['chili', '🌶️'],
  ['pepper', '🌶️'],
  ['cumin', '🥄'],
  ['parsley', '🌿'],
  ['herb', '🌿'],
  ['cucumber', '🥒'],
  ['vinegar', '🫙'],
  ['garlic', '🧄'],
  ['onion', '🧅'],
  ['tomato', '🍅'],
]

export function ingredientIcon(phrase: string): string {
  const p = phrase.toLowerCase()
  for (const [keyword, icon] of INGREDIENT_ICONS) {
    if (p.includes(keyword)) return icon
  }
  return FALLBACK_INGREDIENT_ICON
}
