import React, { useEffect, useRef, useState } from 'react';
import { searchItems, addObjective } from '../api.js';
import { typeMeta } from '../typeMeta.js';

// Naively infer a type label from a title for the dropdown chip (display only).
// Returns null when unsure — the real type is resolved by category on add.
function inferType(title) {
  if (/prime/i.test(title)) return 'prime_warframe';
  if (/\bblueprint\b/i.test(title)) return 'blueprint';
  return null;
}

export default function SearchBar({ existingPages = [], onAdd, onToast }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(null); // wikiPage being added
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);

  // Debounced search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchItems(query);
        setResults(res);
      } catch (err) {
        onToast?.(err.message || 'Search failed', 'error');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query, onToast]);

  // Close on outside click / Escape.
  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  async function handlePick(result) {
    setAdding(result.wikiPage);
    try {
      const created = await addObjective(result.wikiPage, result.title);
      if (created.parsingFailed) {
        onToast?.('No structured data — check the wiki', 'error');
      } else {
        onToast?.(`${created.name} added`, 'success');
        onAdd?.(created);
        setQuery('');
        setResults([]);
        setOpen(false);
      }
    } catch (err) {
      if (err.status === 409) onToast?.('Already in your list', 'error');
      else onToast?.(err.message || 'Could not add', 'error');
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="search" ref={wrapRef}>
      <input
        className="search__input"
        placeholder="Search an item (e.g. rhino prime, serration)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.trim() && setOpen(true)}
      />

      {open && (
        <div className="search__dropdown">
          {loading && <div className="search__hint">Searching…</div>}

          {!loading && results.length === 0 && (
            <div className="search__hint">No results</div>
          )}

          {!loading &&
            results.map((r) => {
              const isDup = existingPages.includes(r.wikiPage);
              const hint = inferType(r.title);
              const meta = hint ? typeMeta(hint) : null;
              return (
                <button
                  key={r.wikiPage}
                  className="search__result"
                  disabled={isDup || adding === r.wikiPage}
                  onClick={() => handlePick(r)}
                >
                  <span style={{ minWidth: 0 }}>
                    <span className="search__result-title">{r.title}</span>
                    {r.snippet && (
                      <span className="search__result-snippet">
                        {r.snippet.slice(0, 70)}
                      </span>
                    )}
                  </span>
                  {isDup ? (
                    <span className="badge badge--mod">In your list</span>
                  ) : adding === r.wikiPage ? (
                    <span className="badge badge--mod">Adding…</span>
                  ) : meta ? (
                    <span className={`badge badge--${meta.badge}`}>{meta.label}</span>
                  ) : null}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
