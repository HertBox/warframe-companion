// wikiAPI.js — ALL fetch calls to wiki.warframe.com. Zero filesystem access.
// Requests are server-side so there are no CORS issues and no &origin= needed.

import fetch from 'node-fetch';

const WIKI_BASE = process.env.WIKI_BASE || 'https://wiki.warframe.com/api.php';

const HEADERS = {
  'User-Agent': 'WarframeCompanion/1.0 (personal tool)',
};

async function wikiGet(params) {
  const url = new URL(WIKI_BASE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Wiki API ${res.status} for ${url.searchParams.get('action')}`);
  }
  return res.json();
}

// Search the wiki. Returns [{ title, snippet }].
export async function searchWiki(query) {
  const data = await wikiGet({
    action: 'query',
    list: 'search',
    srsearch: query,
    format: 'json',
  });
  const results = data?.query?.search || [];
  return results.map((r) => ({
    title: r.title,
    // snippet contains HTML highlight markup; strip tags for plain text.
    snippet: (r.snippet || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' '),
  }));
}

// Returns the wiki categories for a page (used for reliable type detection).
// e.g. Rhino -> ["Warframes", ...], Braton -> ["Weapons", ...].
export async function fetchCategories(wikiPage) {
  const data = await wikiGet({
    action: 'parse',
    page: wikiPage,
    prop: 'categories',
    redirects: '1',
    format: 'json',
  });
  return (data?.parse?.categories || [])
    .map((c) => (c['*'] || '').replace(/_/g, ' '))
    .filter((c) => c && !/hidden|stub|article|^pages?$/i.test(c));
}

// Returns all page titles in a wiki category (follows cmcontinue paging).
// e.g. fetchCategoryMembers('Warframes') -> ["Ash", "Ash/Prime", ...].
export async function fetchCategoryMembers(category) {
  const titles = [];
  let cmcontinue;
  do {
    const params = {
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${category}`,
      cmlimit: '500',
      cmtype: 'page',
      format: 'json',
    };
    if (cmcontinue) params.cmcontinue = cmcontinue;
    const data = await wikiGet(params);
    for (const m of data?.query?.categorymembers || []) titles.push(m.title);
    cmcontinue = data?.continue?.cmcontinue;
  } while (cmcontinue);
  return titles;
}

// Returns a Map(wikiPage -> thumbnail URL) for the given pages, batched (50 per
// request). wikiPage uses underscores (e.g. "Ash_Prime", "Ash/Prime").
export async function fetchPageImages(wikiPages, size = 160) {
  const result = new Map();
  const unique = [...new Set(wikiPages)];
  // title (spaces) -> original wikiPage, for mapping the response back.
  const titleToPage = new Map();
  for (const p of unique) titleToPage.set(p.replace(/_/g, ' '), p);

  const titles = [...titleToPage.keys()];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await wikiGet({
      action: 'query',
      prop: 'pageimages',
      piprop: 'thumbnail',
      pithumbsize: String(size),
      titles: batch.join('|'),
      redirects: '1',
      format: 'json',
    });
    for (const page of Object.values(data?.query?.pages || {})) {
      const wikiPage = titleToPage.get(page.title);
      if (wikiPage && page.thumbnail?.source) {
        result.set(wikiPage, page.thumbnail.source);
      }
    }
  }
  return result;
}

// Returns the list of sections for a page: [{ index, anchor, line, ... }].
export async function fetchSections(wikiPage) {
  const data = await wikiGet({
    action: 'parse',
    page: wikiPage,
    prop: 'sections',
    redirects: '1',
    format: 'json',
  });
  return data?.parse?.sections || [];
}

// Returns raw wikitext for a single section of a page.
export async function fetchSection(page, index) {
  const data = await wikiGet({
    action: 'parse',
    page,
    prop: 'wikitext',
    section: String(index),
    format: 'json',
  });
  return data?.parse?.wikitext?.['*'] || '';
}

// Returns rendered HTML for the full page (primary path for warframes/weapons,
// since their Acquisition/Crafting sections are transcluded and have no usable
// per-section wikitext). redirects=1 resolves pages like Rhino_Prime -> Rhino/Prime.
export async function fetchFullPage(wikiPage) {
  const data = await wikiGet({
    action: 'parse',
    page: wikiPage,
    prop: 'text',
    redirects: '1',
    disablelimitreport: '1',
    format: 'json',
  });
  return data?.parse?.text?.['*'] || '';
}
