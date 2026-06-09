import React, { useMemo } from 'react';

// Top summary: global part progress + the single most useful next action
// (the location/source that would yield the most still-needed parts).
export default function SummaryBar({ objectives }) {
  const { total, obtained, next } = useMemo(() => {
    let total = 0;
    let obtained = 0;
    const counts = new Map(); // key -> { count, label }

    for (const obj of objectives) {
      for (const part of obj.parts || []) {
        total += 1;
        if (part.obtained) {
          obtained += 1;
          continue;
        }
        // Pick the most actionable key for a still-needed part.
        const key =
          part.sourceNode ||
          part.source ||
          (part.relic ? part.relic.split(',')[0].trim() : '');
        if (!key || /mercado/i.test(key)) continue;
        const entry = counts.get(key) || { count: 0, label: key };
        entry.count += 1;
        counts.set(key, entry);
      }
    }

    let next = null;
    for (const entry of counts.values()) {
      if (!next || entry.count > next.count) next = entry;
    }
    return { total, obtained, next };
  }, [objectives]);

  if (total === 0) return null;

  const pct = total ? (obtained / total) * 100 : 0;

  return (
    <div className="summary">
      <div className="summary__row">
        <span className="summary__label">Progreso total</span>
        <span className="summary__value">
          {obtained} / {total} partes
        </span>
      </div>
      <div className="progress__track">
        <div className="progress__fill" style={{ width: `${pct}%` }} />
      </div>
      {next && (
        <div className="summary__next">
          <span>▶ Siguiente:</span>
          <span className="summary__next-loc">{next.label}</span>
          <span className="summary__next-count">
            ({next.count} {next.count === 1 ? 'parte' : 'partes'})
          </span>
        </div>
      )}
    </div>
  );
}
