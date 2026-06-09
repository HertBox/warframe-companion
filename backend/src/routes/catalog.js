// routes/catalog.js — GET /api/catalog
// Returns a browsable warframe/weapon catalog built from wiki categories,
// cached locally (store) and rebuilt on a TTL or when ?refresh=1.
import express from 'express';
import * as store from '../store.js';
import { fetchCategoryMembers, fetchPageImages } from '../wikiAPI.js';
import { buildCatalog } from '../catalog.js';

const router = express.Router();

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function rebuild() {
  const [warframes, primary, secondary, melee] = await Promise.all([
    fetchCategoryMembers('Warframes'),
    fetchCategoryMembers('Primary Weapons'),
    fetchCategoryMembers('Secondary Weapons'),
    fetchCategoryMembers('Melee Weapons'),
  ]);
  const catalog = buildCatalog({ warframes, primary, secondary, melee });

  // Attach thumbnail URLs (batched). Best-effort: skip silently on failure.
  try {
    const all = [...catalog.warframes, ...catalog.weapons];
    const images = await fetchPageImages(all.map((e) => e.wikiPage));
    for (const e of all) e.image = images.get(e.wikiPage) || '';
  } catch (err) {
    console.warn('[catalog] image fetch failed:', err.message);
  }

  await store.saveCatalog(catalog);
  return catalog;
}

router.get('/', async (req, res) => {
  try {
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    let catalog = force ? null : await store.getCatalog();

    const stale =
      !catalog ||
      !catalog.updatedAt ||
      Date.now() - new Date(catalog.updatedAt).getTime() > TTL_MS;

    if (stale) {
      console.log('[catalog] rebuilding from wiki categories…');
      catalog = await rebuild();
    }
    res.json(catalog);
  } catch (err) {
    console.error('[catalog] error:', err.message);
    // If a rebuild failed but we have a stale cache, serve it rather than error.
    const cached = await store.getCatalog().catch(() => null);
    if (cached) return res.json(cached);
    res.status(502).json({ error: 'failed to build catalog', detail: err.message });
  }
});

export default router;
