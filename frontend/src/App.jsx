import React, { useEffect, useState, useCallback, useRef } from 'react';
import Header from './components/Header.jsx';
import SearchBar from './components/SearchBar.jsx';
import FilterChips from './components/FilterChips.jsx';
import ObjectiveCard from './components/ObjectiveCard.jsx';
import CompletedSection from './components/CompletedSection.jsx';
import MaterialsPanel from './components/MaterialsPanel.jsx';
import CatalogView from './components/CatalogView.jsx';
import SummaryBar from './components/SummaryBar.jsx';
import LoadingSkeleton from './components/LoadingSkeleton.jsx';
import Toast from './components/Toast.jsx';
import {
  fetchObjectives,
  togglePart,
  markObtained,
  removeObjective,
  refreshObjective,
} from './api.js';
import { typeBucket } from './typeMeta.js';

let toastSeq = 0;

export default function App() {
  const [objectives, setObjectives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [toasts, setToasts] = useState([]);
  const [showMaterials, setShowMaterials] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [completedKey, setCompletedKey] = useState(0);

  const objectivesRef = useRef(objectives);
  objectivesRef.current = objectives;

  const pushToast = useCallback((message, variant = 'error') => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { id, message, variant }]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const load = useCallback(async () => {
    try {
      setObjectives(await fetchObjectives());
    } catch (err) {
      pushToast(err.message || 'No se pudieron cargar los objetivos');
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    load();
  }, [load]);

  // --- Mutations with optimistic UI -------------------------------------

  function handleAdd(created) {
    // Re-fetch so cross-refs (sharedWith) recompute across all objectives.
    load();
  }

  async function handlePartToggle(objectiveId, partId, obtained) {
    // Optimistic: flip locally first.
    setObjectives((prev) =>
      prev.map((o) =>
        o.id === objectiveId
          ? {
              ...o,
              parts: o.parts.map((p) =>
                p.id === partId
                  ? {
                      ...p,
                      obtained,
                      obtainedAt: obtained ? new Date().toISOString() : null,
                    }
                  : p
              ),
            }
          : o
      )
    );
    try {
      await togglePart(objectiveId, partId, obtained);
    } catch (err) {
      // Revert.
      setObjectives((prev) =>
        prev.map((o) =>
          o.id === objectiveId
            ? {
                ...o,
                parts: o.parts.map((p) =>
                  p.id === partId ? { ...p, obtained: !obtained } : p
                ),
              }
            : o
        )
      );
      pushToast('No se pudo guardar — revertido');
    }
  }

  async function handleMarkObtained(objectiveId, obtained) {
    setObjectives((prev) =>
      prev.map((o) =>
        o.id === objectiveId ? { ...o, obtained } : o
      )
    );
    try {
      await markObtained(objectiveId, obtained);
    } catch (err) {
      setObjectives((prev) =>
        prev.map((o) =>
          o.id === objectiveId ? { ...o, obtained: !obtained } : o
        )
      );
      pushToast('No se pudo guardar — revertido');
    }
  }

  async function handleRemove(objectiveId, mode) {
    const prev = objectivesRef.current;
    // Optimistic removal.
    setObjectives((p) => p.filter((o) => o.id !== objectiveId));
    try {
      await removeObjective(objectiveId);
      pushToast(
        mode === 'completed' ? 'Marcado como completado' : 'Eliminado',
        mode === 'completed' ? 'success' : 'error'
      );
      setCompletedKey((k) => k + 1);
    } catch (err) {
      setObjectives(prev);
      pushToast('No se pudo eliminar');
    }
  }

  async function handleRefresh(objectiveId) {
    try {
      const updated = await refreshObjective(objectiveId);
      if (updated.parsingFailed) {
        pushToast('La wiki no devolvió datos estructurados');
        return;
      }
      pushToast('Actualizado desde la wiki', 'success');
      // Reload to recompute cross-refs.
      load();
    } catch (err) {
      pushToast(err.message || 'No se pudo actualizar');
    }
  }

  function handleReadd() {
    load();
  }

  // --- Derived ----------------------------------------------------------

  const existingPages = objectives.map((o) => o.wikiPage);

  // Completion ratio for sorting (almost-done first).
  const ratio = (o) => {
    const parts = o.parts || [];
    if (parts.length) return parts.filter((p) => p.obtained).length / parts.length;
    return o.obtained ? 1 : 0;
  };

  const filtered = objectives
    .filter((o) => {
      if (filter === 'all') return true;
      if (filter === 'resources') return (o.materials || []).length > 0;
      return typeBucket(o.type) === filter;
    })
    .sort((a, b) => ratio(b) - ratio(a) || a.name.localeCompare(b.name));

  return (
    <div className="app">
      <Header activeCount={objectives.length} />

      <main className="app__main">
        <SearchBar
          existingPages={existingPages}
          onAdd={handleAdd}
          onToast={pushToast}
        />
        <button className="catalog-open" onClick={() => setShowCatalog(true)}>
          ▦ Explorar catálogo de Warframes y Armas
        </button>
        <FilterChips active={filter} onChange={setFilter} />

        {!loading && objectives.length > 0 && (
          <SummaryBar objectives={objectives} />
        )}

        {loading ? (
          <LoadingSkeleton count={3} />
        ) : filtered.length === 0 ? (
          <div className="empty">
            {objectives.length === 0
              ? 'No hay objetivos. Busca un item para empezar.'
              : 'Nada en este filtro.'}
          </div>
        ) : (
          filtered.map((obj) => (
            <ObjectiveCard
              key={obj.id}
              objective={obj}
              onPartToggle={handlePartToggle}
              onMarkObtained={handleMarkObtained}
              onRemove={handleRemove}
              onRefresh={handleRefresh}
            />
          ))
        )}

        <CompletedSection
          refreshKey={completedKey}
          onReadd={handleReadd}
          onToast={pushToast}
        />
      </main>

      {/* Floating materials button */}
      <button
        className="fab"
        aria-label="Materiales"
        onClick={() => setShowMaterials(true)}
      >
        ⊞
      </button>

      {showMaterials && (
        <MaterialsPanel
          objectives={objectives}
          onClose={() => setShowMaterials(false)}
        />
      )}

      {showCatalog && (
        <CatalogView
          existingPages={existingPages}
          onAdd={handleAdd}
          onToast={pushToast}
          onClose={() => setShowCatalog(false)}
        />
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
