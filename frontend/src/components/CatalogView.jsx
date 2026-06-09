import React, { useEffect, useMemo, useState } from 'react';
import { fetchCatalog, addObjective } from '../api.js';
import { typeMeta } from '../typeMeta.js';

// Full-screen overlay to browse + add Warframes/Weapons inferred from the wiki.
export default function CatalogView({ existingPages = [], onAdd, onToast, onClose }) {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('warframes'); // 'warframes' | 'weapons'
  const [sub, setSub] = useState('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(null);
  const [addedPages, setAddedPages] = useState([]); // added during this session

  async function load(force = false) {
    force ? setRefreshing(true) : setLoading(true);
    try {
      setCatalog(await fetchCatalog(force));
    } catch (err) {
      onToast?.(err.message || 'No se pudo cargar el catálogo', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset sub-filter when switching tabs.
  useEffect(() => setSub('all'), [tab]);

  const subFilters =
    tab === 'warframes'
      ? [
          { key: 'all', label: 'Todos' },
          { key: 'normal', label: 'Normales' },
          { key: 'prime', label: 'Prime' },
        ]
      : [
          { key: 'all', label: 'Todas' },
          { key: 'Primaria', label: 'Primarias' },
          { key: 'Secundaria', label: 'Secundarias' },
          { key: 'Cuerpo a cuerpo', label: 'Melee' },
        ];

  const items = useMemo(() => {
    if (!catalog) return [];
    const list = tab === 'warframes' ? catalog.warframes : catalog.weapons;
    const q = query.trim().toLowerCase();
    return list.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q)) return false;
      if (sub === 'all') return true;
      if (tab === 'warframes') {
        const isPrime = e.type === 'prime_warframe';
        return sub === 'prime' ? isPrime : !isPrime;
      }
      return e.subtype === sub;
    });
  }, [catalog, tab, sub, query]);

  async function handleAdd(entry) {
    setAdding(entry.wikiPage);
    try {
      const created = await addObjective(entry.wikiPage, entry.name);
      if (created.parsingFailed) {
        onToast?.('Sin datos estructurados — revisa la wiki', 'error');
      } else {
        onToast?.(`${created.name} añadido`, 'success');
        setAddedPages((p) => [...p, entry.wikiPage]);
        onAdd?.(created);
      }
    } catch (err) {
      if (err.status === 409) onToast?.('Ya en tu lista', 'error');
      else onToast?.(err.message || 'No se pudo añadir', 'error');
    } finally {
      setAdding(null);
    }
  }

  const inList = (page) => existingPages.includes(page) || addedPages.includes(page);

  return (
    <div className="overlay">
      <div className="overlay__head">
        <span className="overlay__title">Catálogo</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-sm btn-gold"
            disabled={refreshing}
            onClick={() => load(true)}
          >
            {refreshing ? '↻…' : '↻'}
          </button>
          <button className="btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      <div className="catalog__controls">
        <div className="chips">
          <button
            className={`chip ${tab === 'warframes' ? 'chip--active' : ''}`}
            onClick={() => setTab('warframes')}
          >
            Warframes {catalog ? `(${catalog.warframes.length})` : ''}
          </button>
          <button
            className={`chip ${tab === 'weapons' ? 'chip--active' : ''}`}
            onClick={() => setTab('weapons')}
          >
            Armas {catalog ? `(${catalog.weapons.length})` : ''}
          </button>
        </div>

        <div className="chips">
          {subFilters.map((f) => (
            <button
              key={f.key}
              className={`chip ${sub === f.key ? 'chip--active' : ''}`}
              onClick={() => setSub(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          className="search__input"
          placeholder="Filtrar por nombre…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="overlay__body catalog__list">
        {loading && <div className="search__hint">Cargando catálogo…</div>}
        {!loading && items.length === 0 && (
          <div className="empty">Nada coincide con el filtro.</div>
        )}
        {!loading &&
          items.map((entry) => {
            const meta = typeMeta(entry.type);
            const added = inList(entry.wikiPage);
            return (
              <div className="catalog-row" key={entry.wikiPage}>
                {entry.image ? (
                  <img
                    className="catalog-row__thumb"
                    src={entry.image}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="card__type-icon">{meta.icon}</span>
                )}
                <div className="catalog-row__body">
                  <span className="catalog-row__name">{entry.name}</span>
                  <span className="catalog-row__meta">
                    {meta.label}
                    {entry.subtype ? ` · ${entry.subtype}` : ''}
                  </span>
                </div>
                {added ? (
                  <span className="badge badge--mod">En lista</span>
                ) : (
                  <button
                    className="btn-sm btn-gold"
                    disabled={adding === entry.wikiPage}
                    onClick={() => handleAdd(entry)}
                  >
                    {adding === entry.wikiPage ? '…' : '+ Añadir'}
                  </button>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
