// catalog.js — pure transformation of raw wiki category lists into clean,
// selectable catalog entries. ZERO fetch, ZERO filesystem (mirrors parser.js).

// Meta / non-item pages that show up inside item categories.
const BLOCKLIST = new Set([
  'Abilities', 'Animation Set', 'Warframes', 'Warframe', 'Helminth',
  'Archwing', 'Companions', 'Companion', 'Operator', 'Drifter', 'Focus',
  'Weapons', 'Weapon', 'Primary Weapons', 'Secondary Weapons', 'Melee Weapons',
  'Mods', 'Prime', 'Exalted Weapons', 'Robotic Weapons', 'Zaw', 'Kitgun',
  'Damage', 'Polarity', 'Syndicate', 'Conclave',
]);

// Turn a raw category title into a clean entry, or null if it should be dropped.
//   kind:    'warframe' | 'weapon'
//   subtype: e.g. 'Primary' (only meaningful for weapons)
function normalizeTitle(title, kind, subtype) {
  // Namespaced pages (Conclave:, User:, Category:, File:, …).
  if (title.includes(':')) return null;
  if (BLOCKLIST.has(title)) return null;

  let name = title;
  let isPrime = false;

  if (title.includes('/')) {
    // Only "/Prime" subpages are real items; other subpages (/Main, /abilities) are noise.
    if (/\/Prime$/.test(title)) {
      name = title.replace(/\/Prime$/, ' Prime');
      isPrime = true;
    } else {
      return null;
    }
  } else if (/\bPrime\b/.test(title)) {
    isPrime = true;
  }

  const type =
    kind === 'warframe'
      ? isPrime ? 'prime_warframe' : 'warframe'
      : isPrime ? 'prime_weapon' : 'weapon';

  return {
    name,
    wikiPage: title.replace(/ /g, '_'), // slashes preserved (e.g. Ash/Prime)
    type,
    subtype: kind === 'weapon' ? subtype : '',
  };
}

function cleanList(titles, kind, subtype) {
  const out = [];
  const seen = new Set();
  for (const t of titles) {
    const entry = normalizeTitle(t, kind, subtype);
    if (!entry || seen.has(entry.wikiPage)) continue;
    seen.add(entry.wikiPage);
    out.push(entry);
  }
  return out;
}

// raw = { warframes:[], primary:[], secondary:[], melee:[] } (arrays of titles).
// Returns { updatedAt, warframes:[entry], weapons:[entry] } sorted by name.
export function buildCatalog(raw) {
  const byName = (a, b) => a.name.localeCompare(b.name);

  const warframes = cleanList(raw.warframes || [], 'warframe', '').sort(byName);

  const weapons = [
    ...cleanList(raw.primary || [], 'weapon', 'Primary'),
    ...cleanList(raw.secondary || [], 'weapon', 'Secondary'),
    ...cleanList(raw.melee || [], 'weapon', 'Melee'),
  ];
  // Dedupe across weapon categories (a few pages are cross-listed).
  const seen = new Set();
  const dedupWeapons = weapons.filter((w) => {
    if (seen.has(w.wikiPage)) return false;
    seen.add(w.wikiPage);
    return true;
  });
  dedupWeapons.sort(byName);

  return {
    updatedAt: new Date().toISOString(),
    warframes,
    weapons: dedupWeapons,
  };
}
