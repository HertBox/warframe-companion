// routes/proxy.js — GET /api/wiki/proxy?page=...
// Returns rendered wiki HTML so the frontend never calls the wiki directly.
import express from 'express';
import { fetchFullPage } from '../wikiAPI.js';

const router = express.Router();

router.get('/proxy', async (req, res) => {
  const page = req.query.page;
  if (!page) return res.status(400).json({ error: 'page query param is required' });
  try {
    const html = await fetchFullPage(String(page));
    res.json({ page, html });
  } catch (err) {
    console.error('[proxy] error:', err.message);
    res.status(502).json({ error: 'failed to fetch wiki page', detail: err.message });
  }
});

export default router;
