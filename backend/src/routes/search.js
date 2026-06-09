// routes/search.js — POST /api/search
import express from 'express';
import { searchWiki } from '../wikiAPI.js';

const router = express.Router();

// Abbreviation normalization — append the canonical wiki term.
const ABBREVIATIONS = {
  neuro: 'Neuroptics',
  sys: 'Systems',
  bp: 'Blueprint',
};

function normalizeQuery(query) {
  let q = (query || '').trim();
  const lower = q.toLowerCase();
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    // Match the abbreviation as a standalone word.
    const re = new RegExp(`\\b${abbr}\\b`, 'i');
    if (re.test(lower) && !new RegExp(`\\b${full}\\b`, 'i').test(lower)) {
      q = `${q} ${full}`;
    }
  }
  return q.trim();
}

router.post('/', async (req, res) => {
  const { query } = req.body || {};
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }
  try {
    const normalized = normalizeQuery(query);
    const results = await searchWiki(normalized);
    const top = results.slice(0, 5).map((r) => ({
      title: r.title,
      snippet: r.snippet,
      wikiPage: r.title.replace(/ /g, '_'),
    }));
    res.json(top);
  } catch (err) {
    console.error('[search] error:', err.message);
    res.status(502).json({ error: 'wiki search failed', detail: err.message });
  }
});

export default router;
