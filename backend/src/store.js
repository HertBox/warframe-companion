// store.js — the ONLY module that touches the filesystem.
// All persistence for objectives + completed entries goes through here.
// Uses a single Promise-chain write queue so concurrent writes can't corrupt files.

import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const OBJECTIVES_FILE = path.join(DATA_DIR, 'objectives.json');
const COMPLETED_FILE = path.join(DATA_DIR, 'completed.json');
const CATALOG_FILE = path.join(DATA_DIR, 'catalog.json');

// Serialize all writes through a single promise chain. Each enqueued task
// waits for the previous one to settle before running.
let writeQueue = Promise.resolve();

function enqueueWrite(task) {
  const run = writeQueue.then(task, task);
  // Keep the chain alive even if a task rejects.
  writeQueue = run.catch(() => {});
  return run;
}

async function readJson(file) {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    const trimmed = raw.trim();
    if (!trimmed) return [];
    return JSON.parse(trimmed);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

// Ensure data dir + both files exist (called on startup from index.js).
export async function init() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  for (const file of [OBJECTIVES_FILE, COMPLETED_FILE]) {
    try {
      await fs.access(file);
    } catch {
      await writeJson(file, []);
    }
  }
}

// --- Active objectives ---------------------------------------------------

export async function getAll() {
  return readJson(OBJECTIVES_FILE);
}

export async function getById(id) {
  const all = await readJson(OBJECTIVES_FILE);
  return all.find((o) => o.id === id) || null;
}

export async function save(objective) {
  return enqueueWrite(async () => {
    const all = await readJson(OBJECTIVES_FILE);
    all.push(objective);
    await writeJson(OBJECTIVES_FILE, all);
    return objective;
  });
}

export async function update(id, patch) {
  return enqueueWrite(async () => {
    const all = await readJson(OBJECTIVES_FILE);
    const idx = all.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch };
    await writeJson(OBJECTIVES_FILE, all);
    return all[idx];
  });
}

// Remove from objectives.json and append to completed.json with a timestamp.
export async function remove(id) {
  return enqueueWrite(async () => {
    const all = await readJson(OBJECTIVES_FILE);
    const idx = all.findIndex((o) => o.id === id);
    if (idx === -1) return null;

    const [removed] = all.splice(idx, 1);
    const allPartsObtained =
      Array.isArray(removed.parts) && removed.parts.length > 0
        ? removed.parts.every((p) => p.obtained)
        : Boolean(removed.obtained);

    const completedEntry = {
      ...removed,
      completedAt: new Date().toISOString(),
      allPartsObtained,
    };

    const completed = await readJson(COMPLETED_FILE);
    completed.push(completedEntry);

    await writeJson(OBJECTIVES_FILE, all);
    await writeJson(COMPLETED_FILE, completed);
    return completedEntry;
  });
}

// --- Catalog cache -------------------------------------------------------
// Browsable warframe/weapon catalog built from wiki categories. Stored as an
// object ({ updatedAt, warframes, weapons }), not an array.

export async function getCatalog() {
  try {
    const raw = await fs.readFile(CATALOG_FILE, 'utf-8');
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveCatalog(catalog) {
  return enqueueWrite(async () => {
    await writeJson(CATALOG_FILE, catalog);
    return catalog;
  });
}

// --- Completed -----------------------------------------------------------

export async function getCompleted() {
  return readJson(COMPLETED_FILE);
}

// Remove an entry from completed.json (used when re-adding to active list).
export async function removeCompleted(id) {
  return enqueueWrite(async () => {
    const completed = await readJson(COMPLETED_FILE);
    const idx = completed.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    const [removed] = completed.splice(idx, 1);
    await writeJson(COMPLETED_FILE, completed);
    return removed;
  });
}
