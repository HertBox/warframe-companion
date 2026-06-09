import React, { useMemo } from 'react';

// Aggregates materials across all active objectives.
export default function MaterialsPanel({ objectives, onClose }) {
  const grouped = useMemo(() => {
    const map = new Map();
    for (const obj of objectives) {
      for (const mat of obj.materials || []) {
        const key = mat.name;
        if (!map.has(key)) {
          map.set(key, {
            name: mat.name,
            total: 0,
            whereFarm: mat.whereFarm || '',
            neededFor: new Set(),
          });
        }
        const entry = map.get(key);
        entry.total += mat.quantity || 0;
        entry.neededFor.add(obj.name);
        if (!entry.whereFarm && mat.whereFarm) entry.whereFarm = mat.whereFarm;
      }
    }
    return Array.from(map.values())
      .map((m) => ({ ...m, neededFor: Array.from(m.neededFor) }))
      // Shared materials (needed for most objectives) first.
      .sort((a, b) => b.neededFor.length - a.neededFor.length || b.total - a.total);
  }, [objectives]);

  return (
    <div className="overlay">
      <div className="overlay__head">
        <span className="overlay__title">Materiales totales</span>
        <button className="btn-sm" onClick={onClose}>
          ✕ Cerrar
        </button>
      </div>
      <div className="overlay__body">
        {grouped.length === 0 && (
          <div className="empty">No hay materiales todavía.</div>
        )}
        {grouped.map((mat) => (
          <div className="material" key={mat.name}>
            <div className="material__row">
              <span className="material__name">{mat.name}</span>
              {mat.total ? (
                <span className="material__qty">{mat.total.toLocaleString()}</span>
              ) : null}
            </div>
            <span className="material__farm">{mat.whereFarm}</span>
            <span
              className={
                mat.neededFor.length > 1 ? 'material__shared' : 'material__farm'
              }
            >
              Necesario para: {mat.neededFor.join(', ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
