// parser.js — ALL wikitext/HTML parsing. ZERO fetch calls, ZERO filesystem.
// Only string manipulation. If wikitext parsing comes up empty, callers can
// fall back to fetchFullPage() and pass rendered HTML into the *FromHtml helpers.

// Pre-filled farm locations for common resources.
const FARM_LOCATIONS = {
  'Orokin Cell': 'Saturn or Deimos - Survival',
  'Argon Crystal': 'Void - any mission',
  'Neural Sensors': 'Jupiter - Survival',
  Morphics: 'Mercury, Mars, Europa, Pluto',
  'Control Module': 'Europa or Neptune',
  'Nano Spores': 'Saturn, Eris, Neptune - Survival',
  'Alloy Plate': 'Venus, Jupiter, Sedna, Ceres',
  Plastids: 'Saturn, Phobos, Uranus',
  Circuits: 'Venus, Ceres',
  Rubedo: 'Phobos, Earth, Sedna, Europa, Orokin Void',
  Salvage: 'Mars, Jupiter, Sedna',
  'Polymer Bundle': 'Mercury, Venus, Uranus',
  Ferrite: 'Earth, Mercury, Neptune, Void',
  Neurodes: 'Deimos, Lua, Earth, Eris',
  Oxium: 'Corpus maps (Oxium Ospreys)',
  Gallium: 'Mars, Ceres, Uranus (bosses)',
  Tellurium: 'Uranus/Sedna - Archwing, Empyrean',
  Cryotic: 'Excavation missions',
  'Detonite Injector': 'Invasions / Foundry',
  Fieldron: 'Invasions / Foundry',
  'Mutagen Mass': 'Invasions / Foundry',
};

// Multi-word resources first so longer names match before shorter substrings.
const KNOWN_RESOURCES = Object.keys(FARM_LOCATIONS)
  .concat(['Credits'])
  .sort((a, b) => b.length - a.length);

// Boss / assassination target -> star-chart node. Stable data (bosses rarely
// move), used to make a part's drop "source" actionable without another fetch.
const BOSS_NODES = {
  Jackal: 'Venus - Fossa',
  'Lieutenant Lech Kril': 'Ceres - Exta',
  'Lech Kril': 'Ceres - Exta',
  'Captain Vor': 'Mercury - Tolstoj',
  'The Sergeant': 'Phobos - Iliad',
  Sergeant: 'Phobos - Iliad',
  'Councilor Vay Hek': 'Earth - Oro',
  'Vay Hek': 'Earth - Oro',
  'Tyl Regor': 'Uranus - Titania',
  'Kela De Thaym': 'Sedna - Merrow',
  'Sargas Ruk': 'Saturn - Tethys',
  'General Sargas Ruk': 'Saturn - Tethys',
  'Alad V': 'Jupiter - Themisto',
  'Mutalist Alad V': 'Eris - (Mutalist Alad V key)',
  Ambulas: 'Pluto - Hades',
  'Hyena Pack': 'Neptune - Psamathe',
  Raptor: 'Europa - Naamah',
  Lephantis: 'Deimos - Magnacidium',
  Phorid: 'Infested Invasion (varies)',
  'Jordas Golem': 'Eris - (The Jordas Verdict)',
  'Corrupted Vor': 'Void - Belenus / Mot',
};

// Component keywords used to recognise parts and align crafting rows.
const WARFRAME_PARTS = ['Neuroptics', 'Chassis', 'Systems'];
const WEAPON_PARTS = [
  'Barrel', 'Receiver', 'Stock', 'Blade', 'Handle', 'Hilt', 'Link',
  'Grip', 'String', 'Lower Limb', 'Upper Limb', 'Pouch', 'Ornament',
  'Disc', 'Head', 'Guard', 'Boot', 'Gauntlet', 'Buckle', 'Heatsink', 'Action',
];
const COMPONENT_KEYWORDS = [...WARFRAME_PARTS, ...WEAPON_PARTS, 'Blueprint'];

// Relic tiers + a relic-name regex: e.g. "Axi R1", "Neo R2", "Meso N6", "Lith B4".
const RELIC_REGEX = /\b(Lith|Meso|Neo|Axi|Requiem)\s+([A-Z]\d{1,2})\b/g;

// --- Markup stripping ----------------------------------------------------

export function stripWikiMarkup(text) {
  if (!text) return '';
  let out = String(text);

  // <ref>...</ref> and other html-ish tags / comments.
  out = out.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  out = out.replace(/<ref[^>]*\/>/gi, '');
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<br\s*\/?>/gi, ' ');

  // Templates {{...}}: try to keep readable trailing text, else drop.
  out = out.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => {
    const parts = inner.split('|').map((p) => p.trim());
    // For things like {{Icon|...|Plastids}} keep the last human-ish token.
    const last = parts[parts.length - 1];
    if (/^[A-Za-z0-9 '\-]+$/.test(last) && last.length > 1 && !/^\d+$/.test(last)) {
      return last;
    }
    return '';
  });

  // Links [[Link|display]] -> display, [[Link]] -> Link.
  out = out.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  out = out.replace(/\[\[([^\]]+)\]\]/g, '$1');

  // External links [http://... display] -> display
  out = out.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1');
  out = out.replace(/\[https?:\/\/\S+\]/g, '');

  // Bold / italic.
  out = out.replace(/'''([^']+)'''/g, '$1');
  out = out.replace(/''([^']+)''/g, '$1');

  // Headings == Heading ==.
  out = out.replace(/^=+\s*(.*?)\s*=+\s*$/gm, '$1');

  // Entities.
  out = out.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

  return out.replace(/[ \t]+/g, ' ').trim();
}

// --- Type detection ------------------------------------------------------

// Primary signal = wiki categories (reliable). Falls back to content/title.
// categories: array of category names, e.g. ["Warframes", ...].
export function detectType(title, wikitext, categories = []) {
  const cats = categories.join(' | ');
  const isPrime = /\bPrime\b/i.test(title) || /\bPrime\b/i.test(cats);

  if (/\bWarframes?\b/i.test(cats)) return isPrime ? 'prime_warframe' : 'warframe';
  if (/\bWeapons?\b/i.test(cats)) return isPrime ? 'prime_weapon' : 'weapon';

  if (/\bMods\b/i.test(cats)) {
    if (/Baro Ki'?Teer/i.test(wikitext || '') || /\bPrimed\b/i.test(title)) return 'primed_mod';
    if (/\bAugment\b/i.test(cats) || (/\bSyndicate\b/i.test(wikitext || '') && /\bStanding\b/i.test(wikitext || ''))) {
      return 'augment_mod';
    }
    return 'mod';
  }

  // --- Fallback when categories are unavailable ---
  const text = `${title}\n${wikitext || ''}`;
  if (/Daily Tribute/i.test(text)) return 'primed_mod';
  if (/Baro Ki'?Teer/i.test(text)) return 'primed_mod';
  if (/\bSyndicate\b/i.test(text) && /\bStanding\b/i.test(text)) return 'augment_mod';
  if (/\bNeuroptics\b/i.test(text) || /\bChassis\b/i.test(text) || /\bSystems\b/i.test(text)) {
    return isPrime ? 'prime_warframe' : 'warframe';
  }
  if (/\bBarrel\b/i.test(text) || /\bStock\b/i.test(text) || /\bReceiver\b/i.test(text)) {
    return isPrime ? 'prime_weapon' : 'weapon';
  }
  if (isPrime) return 'prime_warframe';
  return 'mod';
}

// Resolve a drop "source" string (e.g. "Jackal Assassination") to a star-chart
// node using the boss map. Returns '' if unknown.
export function resolveNode(source) {
  if (!source) return '';
  for (const [boss, node] of Object.entries(BOSS_NODES)) {
    if (new RegExp(`\\b${escapeRegex(boss)}\\b`, 'i').test(source)) return node;
  }
  return '';
}

// --- Wikitable parsing ---------------------------------------------------

// Parse {| ... |} wikitables into arrays of row-cell arrays.
function parseWikiTables(wikitext) {
  const tables = [];
  const tableRegex = /\{\|([\s\S]*?)\|\}/g;
  let m;
  while ((m = tableRegex.exec(wikitext)) !== null) {
    const body = m[1];
    const rows = [];
    // Split on row separators |-
    const rawRows = body.split(/\n\|-/);
    for (const rawRow of rawRows) {
      const cells = [];
      // Cells start with | or !, possibly multiple on one line with || or !!.
      const lines = rawRow.split('\n');
      for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('{|') || line.startsWith('|+')) continue;
        if (line.startsWith('|') || line.startsWith('!')) {
          const marker = line[0];
          const splitter = marker === '!' ? /!!|\|\|/ : /\|\|/;
          const segs = line.slice(1).split(splitter);
          for (let seg of segs) {
            // Drop cell attributes before a single pipe: style=... | value
            if (seg.includes('|') && !seg.includes('[[')) {
              const pipeIdx = seg.indexOf('|');
              const before = seg.slice(0, pipeIdx);
              if (/=/.test(before) && !/\[\[/.test(before)) {
                seg = seg.slice(pipeIdx + 1);
              }
            }
            cells.push(stripWikiMarkup(seg));
          }
        }
      }
      if (cells.length) rows.push(cells.filter((c) => c !== ''));
    }
    tables.push(rows.filter((r) => r.length));
  }
  return tables;
}

// --- Parts extraction ----------------------------------------------------

export function extractParts(wikitext) {
  if (!wikitext) return [];
  const parts = [];
  const seen = new Set();

  // Strategy 1: wikitables with Part | Relic | Rarity | Chance-ish columns.
  const tables = parseWikiTables(wikitext);
  for (const rows of tables) {
    for (const row of rows) {
      const joined = row.join(' ');
      const relicMatch = joined.match(RELIC_REGEX);
      const rarityMatch = joined.match(/\b(Common|Uncommon|Rare)\b/i);
      const chanceMatch = joined.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
      if (relicMatch) {
        const name = row[0] && !RELIC_REGEX.test(row[0]) ? row[0] : 'Component';
        const key = `${name}|${relicMatch[0]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        parts.push({
          name: cleanPartName(name),
          relic: relicMatch[0],
          rarity: rarityMatch ? capitalize(rarityMatch[1]) : '',
          dropChance: chanceMatch ? `${chanceMatch[1]}%` : '',
        });
      }
    }
  }

  // Strategy 2: loose relic mentions anywhere in the text (line-based).
  if (parts.length === 0) {
    const lines = wikitext.split('\n');
    for (const line of lines) {
      RELIC_REGEX.lastIndex = 0;
      const relicMatch = RELIC_REGEX.exec(line);
      if (!relicMatch) continue;
      const stripped = stripWikiMarkup(line);
      const rarityMatch = stripped.match(/\b(Common|Uncommon|Rare)\b/i);
      const chanceMatch = stripped.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
      const nameMatch = stripped.match(
        /\b(Neuroptics|Chassis|Systems|Barrel|Stock|Receiver|Blueprint|Blade|Handle|Link|Pouch|Ornament|Carapace|Cerebrum|Harness|Wings|Gauntlet|String|Grip|Lower Limb|Upper Limb)\b/i
      );
      const name = nameMatch ? nameMatch[0] : 'Component';
      const key = `${name}|${relicMatch[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push({
        name: cleanPartName(name),
        relic: relicMatch[0],
        rarity: rarityMatch ? capitalize(rarityMatch[1]) : '',
        dropChance: chanceMatch ? `${chanceMatch[1]}%` : '',
      });
    }
  }

  return parts;
}

// --- Sources extraction (mods) ------------------------------------------

export function extractSources(wikitext) {
  if (!wikitext) return [];
  const sources = [];
  const seen = new Set();

  // Baro Ki'Teer: pull Ducats + Credits cost.
  if (/Baro Ki'?Teer/i.test(wikitext)) {
    const ducats = wikitext.match(/(\d[\d,]*)\s*(?:Ducats|Prime Ducats)/i);
    const credits = wikitext.match(/(\d[\d,]*)\s*Credits/i);
    const desc =
      `Baro Ki'Teer` +
      (ducats ? ` — ${ducats[1]} Ducats` : '') +
      (credits ? ` + ${credits[1]} Credits` : '');
    sources.push({ description: desc, location: "Baro Ki'Teer", rotation: '', dropChance: '' });
  }

  // Daily Tribute: pull the day number.
  if (/Daily Tribute/i.test(wikitext)) {
    const day = wikitext.match(/day\s*(\d+)/i);
    sources.push({
      description: 'Daily Tribute' + (day ? ` — Day ${day[1]}` : ''),
      location: 'Daily Tribute',
      rotation: '',
      dropChance: '',
    });
  }

  // Tables with mission/enemy + rotation + drop chance.
  const tables = parseWikiTables(wikitext);
  for (const rows of tables) {
    for (const row of rows) {
      const joined = row.join(' ');
      const chanceMatch = joined.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
      const rotationMatch = joined.match(/\bRotation\s*([ABC])\b|\b([ABC])\b(?=\s*$)/);
      if (!chanceMatch) continue;
      // Use the first non-numeric cell as the name (some tables lead with an
      // index/icon column).
      const nameCell = row.find((c) => c && !/^[+\-]?\d+(\.\d+)?%?$/.test(c.trim()));
      const description = stripWikiMarkup(nameCell || '').slice(0, 120);
      // Skip noise: empty, numeric, or stat-table rows (names never contain %).
      if (!description || /^\d+$/.test(description) || /%/.test(description)) continue;
      const key = description + (chanceMatch ? chanceMatch[1] : '');
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({
        description,
        location: description,
        rotation: rotationMatch ? (rotationMatch[1] || rotationMatch[2]) : '',
        dropChance: `${chanceMatch[1]}%`,
      });
    }
  }

  // Keep special vendor sources (Baro/Daily, no drop %) always. Sort the rest by
  // drop chance and cap, so a common mod doesn't dump 30+ noisy rows.
  const special = sources.filter((s) => !s.dropChance);
  const dropBased = sources
    .filter((s) => s.dropChance)
    .sort((a, b) => parseFloat(b.dropChance) - parseFloat(a.dropChance))
    .slice(0, 15);
  return [...special, ...dropBased];
}

// --- Materials extraction ------------------------------------------------

export function extractMaterials(wikitext) {
  if (!wikitext) return [];
  const materials = [];
  const seen = new Set();

  const addMaterial = (name, quantity) => {
    const matched = matchResource(name);
    if (!matched) return;
    if (seen.has(matched)) return;
    seen.add(matched);
    materials.push({
      name: matched,
      quantity: quantity || 0,
      whereFarm: FARM_LOCATIONS[matched] || '',
    });
  };

  // Strategy 1: crafting tables — resource name + quantity in same row.
  const tables = parseWikiTables(wikitext);
  for (const rows of tables) {
    for (const row of rows) {
      const joined = row.join(' ');
      const qtyMatch = joined.match(/([\d][\d,]*)/);
      for (const res of KNOWN_RESOURCES) {
        if (new RegExp(`\\b${escapeRegex(res)}\\b`, 'i').test(joined)) {
          addMaterial(res, qtyMatch ? parseInt(qtyMatch[1].replace(/,/g, ''), 10) : 0);
        }
      }
    }
  }

  // Strategy 2: inline "Quantity Resource" or "Resource x Quantity" patterns.
  if (materials.length === 0) {
    const text = wikitext;
    for (const res of KNOWN_RESOURCES) {
      const re = new RegExp(
        `(?:([\\d][\\d,]*)\\s*(?:x\\s*)?${escapeRegex(res)})|(?:${escapeRegex(res)}\\s*(?:x\\s*)?([\\d][\\d,]*))`,
        'i'
      );
      const m = text.match(re);
      if (m) {
        const qty = m[1] || m[2];
        addMaterial(res, qty ? parseInt(qty.replace(/,/g, ''), 10) : 0);
      }
    }
  }

  return materials;
}

// --- Top-level item parser ----------------------------------------------

// sectionsData: array of { index, anchor, line } from fetchSections.
// wikitextData: concatenated wikitext of the relevant sections.
export function parseItem(wikiPage, sectionsData, wikitextData) {
  const wikitext = wikitextData || '';
  const title = (wikiPage || '').replace(/_/g, ' ');
  const type = detectType(title, wikitext);

  const parts = extractParts(wikitext);
  // Sources are for mods. When a parts table exists, drop-% rows are the parts
  // themselves, so skip sources to avoid duplicating them.
  const sources = parts.length > 0 ? [] : extractSources(wikitext);
  const materials = extractMaterials(wikitext);

  return { type, name: title, parts, sources, materials };
}

// --- HTML fallback helpers ----------------------------------------------
// Extract data from rendered HTML table rows using basic string matching.

function cleanCell(raw) {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#160;|&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlRowsToText(html) {
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm;
  while ((rm = rowRegex.exec(html)) !== null) {
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm;
    while ((cm = cellRegex.exec(rm[1])) !== null) {
      const txt = cleanCell(cm[1]);
      if (txt) cells.push(txt);
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

// Return each <table> as { rows } where rows keep header(th) vs data(td) info.
function htmlTables(html) {
  const out = [];
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tm;
  while ((tm = tableRegex.exec(html)) !== null) {
    const rows = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm;
    while ((rm = rowRegex.exec(tm[1])) !== null) {
      const cells = [];
      const cellRegex = /<(t[dh])[^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cm;
      let isHeader = false;
      while ((cm = cellRegex.exec(rm[1])) !== null) {
        if (cm[1] === 'th') isHeader = true;
        cells.push(cleanCell(cm[2]));
      }
      rows.push({ cells, isHeader });
    }
    out.push({ rows });
  }
  return out;
}

// Find the component keyword (Neuroptics, Barrel, Blueprint, …) inside a label.
function componentKeyword(label) {
  for (const kw of COMPONENT_KEYWORDS) {
    if (new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i').test(label)) return kw;
  }
  return null;
}

// Parse a single materials/cell value like "Alloy Plate 150" or "Rubedo 1,000".
function parseMaterialCell(cell) {
  const name = matchResource(cell);
  if (!name) return null;
  const qtyMatch = cell.match(/([\d][\d,]*)/);
  return {
    name,
    quantity: qtyMatch ? parseInt(qtyMatch[1].replace(/,/g, ''), 10) : 0,
    whereFarm: FARM_LOCATIONS[name] || '',
  };
}

// --- Structured HTML parsing (primary path for warframes/weapons) --------

// Parse the Acquisition table. Handles two layouts:
//  - Normal: rows of  [Item, Source, Chance, ...]
//  - Prime (transposed): component names as headers, relic lists in cells.
// Returns [{ name, source, relic, rarity, dropChance }].
export function parseAcquisitionFromHtml(html) {
  const tables = htmlTables(html);

  for (const table of tables) {
    const header = table.rows.find((r) => r.isHeader);
    const headerCells = header ? header.cells : [];
    const headerJoined = headerCells.join(' | ').toLowerCase();

    // Normal layout: header has Source + Chance columns.
    if (/source/.test(headerJoined) && /chance/.test(headerJoined)) {
      const srcIdx = headerCells.findIndex((c) => /source/i.test(c));
      const chanceIdx = headerCells.findIndex((c) => /chance/i.test(c));
      const itemIdx = headerCells.findIndex((c) => /item|part|component|name/i.test(c));
      const parts = [];
      for (const row of table.rows) {
        if (row.isHeader) continue;
        const c = row.cells;
        const name = c[itemIdx >= 0 ? itemIdx : 0];
        if (!name || !componentKeyword(name)) continue;
        const chance = c[chanceIdx]?.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
        parts.push({
          name,
          source: c[srcIdx] || '',
          relic: '',
          rarity: '',
          dropChance: chance ? `${chance[1]}%` : '',
        });
      }
      if (parts.length) return parts;
    }

    // Prime transposed layout: every header cell is a component, the next data
    // row holds relic lists per column.
    if (headerCells.length && headerCells.every((c) => componentKeyword(c))) {
      const dataRow = table.rows.find((r) => !r.isHeader && r.cells.some((c) => RELIC_REGEX.test(c)));
      RELIC_REGEX.lastIndex = 0;
      if (dataRow) {
        const parts = [];
        headerCells.forEach((name, i) => {
          const cell = dataRow.cells[i] || '';
          const relics = cell.match(RELIC_REGEX) || [];
          RELIC_REGEX.lastIndex = 0;
          const rarity = (cell.match(/\b(Common|Uncommon|Rare)\b/i) || [])[1] || '';
          parts.push({
            name,
            source: '',
            relic: relics.join(', '),
            rarity: rarity ? capitalize(rarity) : '',
            dropChance: '',
          });
        });
        if (parts.length) return parts;
      }
    }
  }
  return [];
}

// Parse the "Manufacturing Requirements" table into per-component build costs.
// Returns a Map: componentKeyword -> { credits, time, materials: [...] }.
export function parseCraftingFromHtml(html) {
  const tables = htmlTables(html);
  const craftTable = tables.find((t) =>
    t.rows.some((r) => /manufacturing requirements/i.test(r.cells.join(' ')))
  );
  const byComponent = new Map();
  if (!craftTable) return byComponent;

  let current = 'Blueprint'; // first cost block = main blueprint / assembly
  for (const row of craftTable.rows) {
    const cells = row.cells.filter((c) => c !== '');
    if (cells.length === 0) continue;
    const joined = cells.join(' ');

    if (/manufacturing requirements/i.test(joined)) continue;
    if (/^rush:/i.test(joined) || /^market price/i.test(joined)) continue;

    // A single-cell label row naming a component (e.g. "Rhino Chassis Blueprint").
    if (cells.length === 1 && componentKeyword(cells[0])) {
      const kw = componentKeyword(cells[0]);
      // The main top blueprint label also matches "Blueprint"; only switch to a
      // real sub-component, otherwise keep accumulating into the current block.
      if (kw && kw !== 'Blueprint') current = kw;
      else if (kw === 'Blueprint' && !byComponent.has('Blueprint')) current = 'Blueprint';
      continue;
    }

    // A cost row: leading bare number = credits, other cells = "Resource Qty".
    const materials = [];
    let credits = 0;
    let time = '';
    for (const cell of cells) {
      if (/^time:/i.test(cell)) {
        time = cell.replace(/^time:\s*/i, '');
        continue;
      }
      const mat = parseMaterialCell(cell);
      if (mat) {
        materials.push(mat);
      } else if (credits === 0 && /^[\d][\d,]*$/.test(cell)) {
        credits = parseInt(cell.replace(/,/g, ''), 10);
      }
    }
    if (materials.length || credits) {
      if (credits) materials.unshift({ name: 'Credits', quantity: credits, whereFarm: '' });
      byComponent.set(current, { credits, time, materials });
    }
  }
  return byComponent;
}

// Orchestrate full structured parse from rendered HTML for warframes/weapons.
// Returns { type, name, parts, sources, materials } where each part carries its
// own `source`/`relic` and `materials`, and top-level materials is the union.
export function parseItemFromHtml(wikiPage, html, categories = []) {
  const title = (wikiPage || '').replace(/_/g, ' ');
  const type = detectType(title, '', categories);

  const acqParts = parseAcquisitionFromHtml(html);
  const crafting = parseCraftingFromHtml(html);

  // Ensure a main "Blueprint" part exists (normal frames buy it in the Market).
  const hasBlueprintPart = acqParts.some((p) => /\bBlueprint\b/i.test(p.name) && !componentSub(p.name));
  if (!hasBlueprintPart && crafting.has('Blueprint')) {
    const marketMatch = html.match(/Market Price[^<]*?([\d,]+)/i);
    acqParts.unshift({
      name: 'Blueprint (main)',
      source: marketMatch ? `Market (${marketMatch[1]} Platinum)` : 'Market',
      relic: '',
      rarity: '',
      dropChance: '',
    });
  }

  // Attach per-part materials + resolve boss nodes.
  const parts = acqParts.map((p) => {
    const kw = /\(main\)/i.test(p.name) ? 'Blueprint' : componentKeyword(p.name) || 'Blueprint';
    const craft = crafting.get(kw);
    return {
      ...p,
      sourceNode: resolveNode(p.source),
      buildTime: craft?.time || '',
      materials: craft ? craft.materials : [],
    };
  });

  // Top-level materials = union across parts (sum by resource) for the global
  // panel + cross-refs.
  const union = new Map();
  for (const part of parts) {
    for (const mat of part.materials || []) {
      if (mat.name === 'Credits') continue;
      const ex = union.get(mat.name);
      if (ex) ex.quantity += mat.quantity || 0;
      else union.set(mat.name, { ...mat });
    }
  }

  return { type, name: title, parts, sources: [], materials: Array.from(union.values()) };
}

// Is this label a *sub*-component (Neuroptics/Barrel/…) rather than the main BP?
function componentSub(label) {
  for (const kw of [...WARFRAME_PARTS, ...WEAPON_PARTS]) {
    if (new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i').test(label)) return kw;
  }
  return null;
}

export function extractPartsFromHtml(html) {
  const parts = [];
  const seen = new Set();
  for (const row of htmlRowsToText(html)) {
    const joined = row.join(' ');
    RELIC_REGEX.lastIndex = 0;
    const relicMatch = joined.match(RELIC_REGEX);
    if (!relicMatch) continue;
    const rarityMatch = joined.match(/\b(Common|Uncommon|Rare)\b/i);
    const chanceMatch = joined.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
    const name = row[0] || 'Component';
    const key = `${name}|${relicMatch[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push({
      name: cleanPartName(name),
      relic: relicMatch[0],
      rarity: rarityMatch ? capitalize(rarityMatch[1]) : '',
      dropChance: chanceMatch ? `${chanceMatch[1]}%` : '',
    });
  }
  return parts;
}

export function extractSourcesFromHtml(html) {
  const sources = [];
  const seen = new Set();
  for (const row of htmlRowsToText(html)) {
    const joined = row.join(' ');
    const chanceMatch = joined.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
    if (!chanceMatch) continue;
    const rotationMatch = joined.match(/\b([ABC])\b/);
    // First non-numeric cell as the name; skip rank/stat tables (numeric cols).
    const nameCell = row.find((c) => c && !/^[+\-]?\d+(\.\d+)?%?$/.test(c.trim()));
    const description = stripWikiMarkup(nameCell || '').slice(0, 120);
    // Names never contain % — that signals a stat/ranks table, not drops.
    if (!description || /^\d+$/.test(description) || /%/.test(description)) continue;
    const key = description + chanceMatch[1];
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      description,
      location: description,
      rotation: rotationMatch ? rotationMatch[1] : '',
      dropChance: `${chanceMatch[1]}%`,
    });
  }
  return sources
    .sort((a, b) => parseFloat(b.dropChance) - parseFloat(a.dropChance))
    .slice(0, 15);
}

export function extractMaterialsFromHtml(html) {
  const materials = [];
  const seen = new Set();
  for (const row of htmlRowsToText(html)) {
    const joined = row.join(' ');
    const qtyMatch = joined.match(/([\d][\d,]*)/);
    for (const res of KNOWN_RESOURCES) {
      if (new RegExp(`\\b${escapeRegex(res)}\\b`, 'i').test(joined)) {
        const matched = matchResource(res);
        if (!matched || seen.has(matched)) continue;
        seen.add(matched);
        materials.push({
          name: matched,
          quantity: qtyMatch ? parseInt(qtyMatch[1].replace(/,/g, ''), 10) : 0,
          whereFarm: FARM_LOCATIONS[matched] || '',
        });
      }
    }
  }
  return materials;
}

// --- small helpers -------------------------------------------------------

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanPartName(name) {
  return stripWikiMarkup(name).replace(/\s+/g, ' ').trim() || 'Component';
}

function matchResource(name) {
  const cleaned = stripWikiMarkup(name).trim();
  for (const res of KNOWN_RESOURCES) {
    if (new RegExp(`\\b${escapeRegex(res)}\\b`, 'i').test(cleaned)) return res;
  }
  return null;
}

export { FARM_LOCATIONS };
