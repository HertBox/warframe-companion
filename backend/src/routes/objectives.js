// routes/objectives.js — CRUD for objectives + completed list.
import express from 'express';
import * as store from '../store.js';
import {
  fetchSections,
  fetchSection,
  fetchFullPage,
  fetchCategories,
  fetchPageImages,
} from '../wikiAPI.js';
import {
  parseItem,
  parseItemFromHtml,
  detectType,
  extractPartsFromHtml,
  extractSourcesFromHtml,
  extractMaterialsFromHtml,
} from '../parser.js';

const GEAR_TYPES = ['warframe', 'prime_warframe', 'weapon', 'prime_weapon'];

const router = express.Router();

const CACHE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function slugify(name) {
  return (name || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Find a section index whose title matches one of the provided needles.
function findSectionIndex(sections, needles) {
  for (const s of sections) {
    const line = (s.line || '').toLowerCase();
    if (needles.some((n) => line.includes(n))) return s.index;
  }
  return null;
}

// Compute material cross-references across all objectives.
function withCrossRefs(objectives) {
  return objectives.map((obj) => {
    const materials = (obj.materials || []).map((mat) => {
      const sharedWith = objectives
        .filter((other) => other.id !== obj.id)
        .filter((other) =>
          (other.materials || []).some(
            (m) => m.name.toLowerCase() === mat.name.toLowerCase()
          )
        )
        .map((other) => other.name);
      return { ...mat, sharedWith };
    });
    return { ...obj, materials };
  });
}

// GET /api/objectives — enriched with crossRefs.
router.get('/', async (_req, res) => {
  try {
    const all = await store.getAll();
    res.json(withCrossRefs(all));
  } catch (err) {
    console.error('[objectives:get] error:', err.message);
    res.status(500).json({ error: 'failed to read objectives' });
  }
});

// GET /api/completed
router.get('/completed', async (_req, res) => {
  try {
    res.json(await store.getCompleted());
  } catch (err) {
    console.error('[completed:get] error:', err.message);
    res.status(500).json({ error: 'failed to read completed' });
  }
});

// POST /api/completed/:id/readd — move a completed entry back to active.
router.post('/completed/:id/readd', async (req, res) => {
  try {
    const entry = await store.removeCompleted(req.params.id);
    if (!entry) return res.status(404).json({ error: 'not found' });
    // Strip completed-only fields and re-save.
    const { completedAt, allPartsObtained, ...rest } = entry;
    await store.save(rest);
    res.json(rest);
  } catch (err) {
    console.error('[completed:readd] error:', err.message);
    res.status(500).json({ error: 'failed to re-add' });
  }
});

// POST /api/objectives — add a new objective by wikiPage.
router.post('/', async (req, res) => {
  const { wikiPage, name } = req.body || {};
  if (!wikiPage) return res.status(400).json({ error: 'wikiPage is required' });

  try {
    const existing = await store.getAll();
    if (existing.some((o) => o.wikiPage === wikiPage)) {
      return res.status(409).json({ error: 'already in your list' });
    }

    const displayName = name || wikiPage.replace(/_/g, ' ');
    const wikiUrl = `https://wiki.warframe.com/wiki/${wikiPage}`;
    const now = new Date().toISOString();

    // Cache check: reuse parsed data from a recent completed entry.
    const completed = await store.getCompleted();
    const cached = completed.find(
      (c) =>
        c.wikiPage === wikiPage &&
        c.cachedAt &&
        Date.now() - new Date(c.cachedAt).getTime() < CACHE_MS
    );

    let parsed;
    let cachedAt = now;

    if (cached) {
      parsed = {
        type: cached.type,
        name: cached.name,
        parts: cached.parts || [],
        sources: cached.sources || [],
        materials: cached.materials || [],
      };
      cachedAt = cached.cachedAt;
    } else {
      const result = await parseFromWiki(wikiPage);
      if (result.parsingFailed) {
        return res.json({ parsingFailed: true, wikiUrl, name: displayName, wikiPage });
      }
      parsed = result;
    }

    // Best-effort thumbnail (don't fail the add if it errors).
    let image = '';
    try {
      image = (await fetchPageImages([wikiPage])).get(wikiPage) || '';
    } catch (err) {
      console.warn('[objectives] image fetch failed:', err.message);
    }

    const objective = {
      id: `${slugify(displayName)}-${Date.now()}`,
      name: displayName,
      type: parsed.type,
      wikiPage,
      wikiUrl,
      image,
      cachedAt,
      createdAt: now,
      parts: (parsed.parts || []).map((p) => ({
        id: `part-${slugify(p.name)}-${Math.random().toString(36).slice(2, 7)}`,
        name: p.name,
        source: p.source || '',
        sourceNode: p.sourceNode || '',
        relic: p.relic || '',
        rarity: p.rarity || '',
        dropChance: p.dropChance || '',
        buildTime: p.buildTime || '',
        materials: p.materials || [],
        obtained: false,
        obtainedAt: null,
      })),
      sources: parsed.sources || [],
      materials: parsed.materials || [],
      obtained: false,
      obtainedAt: null,
    };

    await store.save(objective);
    res.status(201).json(objective);
  } catch (err) {
    console.error('[objectives:post] error:', err.message);
    res.status(502).json({ error: 'failed to fetch/parse wiki page', detail: err.message });
  }
});

// PATCH /api/objectives/:id/parts/:partId — toggle a part obtained.
router.patch('/:id/parts/:partId', async (req, res) => {
  const { obtained } = req.body || {};
  try {
    const obj = await store.getById(req.params.id);
    if (!obj) return res.status(404).json({ error: 'not found' });

    const parts = (obj.parts || []).map((p) =>
      p.id === req.params.partId
        ? { ...p, obtained: !!obtained, obtainedAt: obtained ? new Date().toISOString() : null }
        : p
    );
    const updated = await store.update(req.params.id, { parts });
    res.json(updated);
  } catch (err) {
    console.error('[parts:patch] error:', err.message);
    res.status(500).json({ error: 'failed to update part' });
  }
});

// PATCH /api/objectives/:id/obtained — mark whole objective (mods).
router.patch('/:id/obtained', async (req, res) => {
  const { obtained } = req.body || {};
  try {
    const updated = await store.update(req.params.id, {
      obtained: !!obtained,
      obtainedAt: obtained ? new Date().toISOString() : null,
    });
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  } catch (err) {
    console.error('[obtained:patch] error:', err.message);
    res.status(500).json({ error: 'failed to update objective' });
  }
});

// DELETE /api/objectives/:id — moves to completed.json.
router.delete('/:id', async (req, res) => {
  try {
    const result = await store.remove(req.params.id);
    if (!result) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[objectives:delete] error:', err.message);
    res.status(500).json({ error: 'failed to remove objective' });
  }
});

// POST /api/objectives/:id/refresh — force re-fetch parsed data from wiki.
router.post('/:id/refresh', async (req, res) => {
  try {
    const obj = await store.getById(req.params.id);
    if (!obj) return res.status(404).json({ error: 'not found' });

    const result = await parseFromWiki(obj.wikiPage);
    if (result.parsingFailed) {
      return res.json({ parsingFailed: true, wikiUrl: obj.wikiUrl });
    }

    // Preserve obtained flags on parts matched by name.
    const prevByName = new Map((obj.parts || []).map((p) => [p.name, p]));
    const parts = (result.parts || []).map((p) => {
      const prev = prevByName.get(p.name);
      return {
        id: prev?.id || `part-${slugify(p.name)}-${Math.random().toString(36).slice(2, 7)}`,
        name: p.name,
        source: p.source || '',
        sourceNode: p.sourceNode || '',
        relic: p.relic || '',
        rarity: p.rarity || '',
        dropChance: p.dropChance || '',
        buildTime: p.buildTime || '',
        materials: p.materials || [],
        obtained: prev ? prev.obtained : false,
        obtainedAt: prev ? prev.obtainedAt : null,
      };
    });

    // Refresh the thumbnail too (so older objectives gain images).
    let image = obj.image || '';
    try {
      image = (await fetchPageImages([obj.wikiPage])).get(obj.wikiPage) || image;
    } catch (err) {
      console.warn('[objectives] image refresh failed:', err.message);
    }

    const updated = await store.update(obj.id, {
      type: result.type,
      parts,
      sources: result.sources || [],
      materials: result.materials || [],
      image,
      cachedAt: new Date().toISOString(),
    });
    res.json(updated);
  } catch (err) {
    console.error('[objectives:refresh] error:', err.message);
    res.status(502).json({ error: 'failed to refresh', detail: err.message });
  }
});

// --- shared wiki parse flow ----------------------------------------------
// Warframes/weapons (incl. primes): rendered-HTML structured parse, since their
// Acquisition/Crafting sections are transcluded. Mods: wikitext sections path.
async function parseFromWiki(wikiPage) {
  const categories = await fetchCategories(wikiPage);
  const title = wikiPage.replace(/_/g, ' ');
  const type = detectType(title, '', categories);

  if (GEAR_TYPES.includes(type)) {
    const html = await fetchFullPage(wikiPage);
    if (!html) return { parsingFailed: true };
    const parsed = parseItemFromHtml(wikiPage, html, categories);
    // Empty parts is valid (e.g. market-bought base weapons like Braton) — the
    // item stays trackable as a whole; only a failed fetch is a real failure.
    if ((parsed.parts || []).length === 0) {
      console.warn(`[parser] gear "${wikiPage}" has no foundry parts (market-bought?)`);
    }
    return parsed;
  }

  // Mods / other: wikitext sections path with HTML fallback.
  const sections = await fetchSections(wikiPage);
  const acqIndex = findSectionIndex(sections, ['acquisition', 'drop', 'source']);
  const craftIndex = findSectionIndex(sections, ['component', 'crafting', 'manufactur']);

  let wikitext = '';
  if (acqIndex != null && acqIndex !== '') {
    wikitext += (await fetchSection(wikiPage, acqIndex)) + '\n';
  }
  if (craftIndex != null && craftIndex !== '' && craftIndex !== acqIndex) {
    wikitext += (await fetchSection(wikiPage, craftIndex)) + '\n';
  }

  const parsed = parseItem(wikiPage, sections, wikitext);
  parsed.type = type; // trust category-based detection

  // Fallback: if wikitext yielded nothing, scrape rendered HTML.
  const emptyParts = (parsed.parts || []).length === 0;
  const emptySources = (parsed.sources || []).length === 0;
  if (emptyParts && emptySources) {
    console.warn(`[parser] wikitext empty for "${wikiPage}", falling back to rendered HTML`);
    const html = await fetchFullPage(wikiPage);
    const htmlParts = extractPartsFromHtml(html);
    const htmlMaterials = extractMaterialsFromHtml(html);
    parsed.parts = htmlParts.length ? htmlParts : parsed.parts;
    parsed.sources = htmlParts.length ? [] : extractSourcesFromHtml(html);
    if ((parsed.materials || []).length === 0 && htmlMaterials.length) {
      parsed.materials = htmlMaterials;
    }
  }

  if (emptyParts && (parsed.sources || []).length === 0 && (parsed.materials || []).length === 0) {
    return { parsingFailed: true };
  }
  return parsed;
}

export default router;
