// index.js — Express app entry point.
import express from 'express';
import cors from 'cors';

import * as store from './store.js';
import searchRouter from './routes/search.js';
import objectivesRouter from './routes/objectives.js';
import proxyRouter from './routes/proxy.js';
import catalogRouter from './routes/catalog.js';

const PORT = process.env.PORT || 3001;

const app = express();

// Personal LAN tool: allow any origin so other devices on the network (phones,
// tablets) can reach the API at http://<LAN-IP>:3001 from http://<LAN-IP>:3000.
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/search', searchRouter);
// /api/objectives also serves /completed and /completed/:id/readd.
app.use('/api/objectives', objectivesRouter);
app.use('/api/wiki', proxyRouter);
app.use('/api/catalog', catalogRouter);

// Convenience alias so the frontend can call GET /api/completed directly.
// (Re-add lives at POST /api/objectives/completed/:id/readd via the router.)
app.get('/api/completed', async (_req, res) => {
  try {
    res.json(await store.getCompleted());
  } catch (err) {
    res.status(500).json({ error: 'failed to read completed' });
  }
});

async function start() {
  await store.init();
  app.listen(PORT, () => {
    console.log(`Warframe Companion backend listening on :${PORT}`);
  });
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
